import fs from "node:fs";
import nodePath from "node:path";

import { Client, EventDispatcher, WSClient } from "@larksuiteoapi/node-sdk";
import { eq } from "drizzle-orm";
import EventEmitter from "eventemitter3";

import type { DrizzleDB } from "@/data";
import type { Logger, TextMessageContent } from "@/shared";
import {
  config,
  createLogger,
  uuid,
  type AssistantMessage,
  type MessageChannel,
  type MessageChannelEventTypes,
  type UserMessage,
} from "@/shared";

import { feishuThreads } from "./data";
import { renderMessageCard } from "./message-renderer";
import type { MessageReceiveEventData } from "./types";
import { convertPostToMarkdown } from "./utils";

/** Message channel implementation for Feishu (Lark) chat platform. */
export class FeishuMessageChannel
  extends EventEmitter<MessageChannelEventTypes>
  implements MessageChannel
{
  readonly type = "feishu";

  private _inboundClient: WSClient;
  private _client: Client;
  private _db: DrizzleDB;
  private _logger: Logger;

  /**
   * Create a Feishu message channel.
   * @param config - Feishu app credentials (defaults to env vars).
   * @param db - Drizzle database instance for persisting thread-to-session mappings.
   */
  constructor(
    readonly id: string,
    readonly config: {
      chatId: string;
      appId: string;
      appSecret: string;
    },
    db: DrizzleDB,
  ) {
    super();
    this.id = id;
    if (!config.appId || !config.appSecret) {
      throw new Error("Feishu app ID and secret are required");
    }
    this._db = db;
    this._logger = createLogger("feishu-message-channel");
    this._inboundClient = new WSClient({
      appId: this.config.appId,
      appSecret: this.config.appSecret,
    });
    this._client = new Client({
      appId: this.config.appId,
      appSecret: this.config.appSecret,
    });
  }

  /** Start listening for inbound messages via WebSocket. */
  async start() {
    await this._inboundClient.start({
      eventDispatcher: new EventDispatcher({}).register({
        "im.message.receive_v1": this._handleMessageReceive,
      }),
    });
  }

  /** Reply to a message in a Feishu chat thread. */
  async replyMessage(
    messageId: string,
    message: Omit<AssistantMessage, "id">,
    { streaming = true }: { streaming?: boolean } = {},
  ): Promise<AssistantMessage> {
    const card = await renderMessageCard(message.content, {
      streaming,
      uploadImage: this.uploadImage.bind(this),
    });
    const { data: replyMessage } = await this._client.im.message.reply({
      path: {
        message_id: messageId,
      },
      data: {
        msg_type: "interactive",
        content: JSON.stringify(card),
        reply_in_thread: true,
      },
    });
    if (!replyMessage) {
      throw new Error("Failed to reply message");
    }

    const { thread_id: threadId } = replyMessage;
    const sessionId = message.session_id;
    this._mapThreadToSession(threadId!, sessionId);

    const assistantMessage = message as AssistantMessage;
    assistantMessage.id = replyMessage.message_id!;
    return assistantMessage;
  }

  async postMessage(
    message: Omit<AssistantMessage, "id">,
  ): Promise<AssistantMessage> {
    const card = await renderMessageCard(message.content, {
      streaming: false,
      uploadImage: this.uploadImage.bind(this),
    });
    const { data } = await this._client.im.message.create({
      params: {
        receive_id_type: "chat_id",
      },
      data: {
        receive_id: this.config.chatId,
        msg_type: "interactive",
        content: JSON.stringify(card),
      },
    });
    if (!data) {
      throw new Error("Failed to post message");
    }
    const { message_id: messageId } = data;
    const assistantMessage = message as AssistantMessage;
    assistantMessage.id = messageId!;
    const emojis = [
      "思考中",
      "送你小红花",
      "送心",
      "灵光一现",
      "辛勤营业",
      "挥手",
    ];
    const { data: replyData } = await this._client.im.message.reply({
      path: {
        message_id: assistantMessage.id,
      },
      data: {
        content: JSON.stringify({
          type: "text",
          text: `[${emojis[Math.floor(Math.random() * emojis.length)]}] Reply here to continue the conversation`,
        }),
        msg_type: "text",
        reply_in_thread: true,
      },
    });
    if (replyData) {
      const { thread_id: threadId } = replyData;
      const sessionId = message.session_id;
      this._mapThreadToSession(threadId!, sessionId);
    }
    return assistantMessage;
  }

  /** Update the content of an existing Feishu message. */
  async updateMessageContent(
    message: AssistantMessage,
    { streaming = true }: { streaming?: boolean } = {},
  ): Promise<void> {
    const card = await renderMessageCard(message.content, {
      streaming,
      uploadImage: this.uploadImage.bind(this),
    });
    await this._client.im.message.patch({
      path: {
        message_id: message.id,
      },
      data: {
        content: JSON.stringify(card),
      },
    });
  }

  /**
   * Uploads an image to Feishu. Returns the key of the uploaded image.
   * @param path - The path to the image to upload.
   * @returns The key of the uploaded image.
   */
  async uploadImage(path: string): Promise<string> {
    const absPath = nodePath.join(config.paths.home, path);
    const file = fs.readFileSync(absPath);
    this._logger.info(`Uploading image ${absPath}`);
    const res = await this._client.im.v1.image.create({
      data: {
        image_type: "message",
        image: file,
      },
    });
    this._logger.info(
      `Uploaded image ${absPath} -> ${res?.image_key || "failed"}`,
    );
    if (res?.image_key) {
      return res.image_key;
    } else {
      throw new Error("Failed to upload image");
    }
  }

  /**
   * Downloads an image or a file from a message.
   * @param messageId - The ID of the message to download the resource from.
   * @param file_key - The key of the file to download.
   * @param file_name - The name of the file to download. If not provided, the file name will be inferred from the file key.
   * @returns The path to the downloaded file.
   */
  async downloadMessageResource(
    messageId: string,
    file_key: string,
    file_name?: string,
  ): Promise<string> {
    const { writeFile, headers } = await this._client.im.v1.messageResource.get(
      {
        path: {
          message_id: messageId,
          file_key,
        },
        params: {
          type: "file",
        },
      },
    );
    const metadata = JSON.parse(
      headers.get("inner_file_data_meta") as string,
    ) as {
      FileName: string;
      Mime: string;
    };
    const isImage = metadata.Mime.startsWith("image/");
    let dir = config.paths.uploads;
    if (isImage) {
      dir = nodePath.join(dir, "images");
    }
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    let filename: string;
    if (file_name) {
      filename = file_name;
    } else {
      filename = metadata.FileName === "image" ? file_key : metadata.FileName;
      if (metadata.Mime.startsWith("image/")) {
        filename += "." + metadata.Mime.split("/")[1];
      } else if (metadata.Mime === "audio/octet-stream") {
        filename += ".ogg";
      } else {
        filename += `.${metadata.Mime.split("/")[1]}`;
      }
    }
    const extname = nodePath.extname(filename);
    filename = filename.substring(0, filename.length - extname.length);
    if (fs.existsSync(nodePath.join(dir, filename + extname))) {
      let i = 1;
      while (fs.existsSync(nodePath.join(dir, filename + `-${i}` + extname))) {
        i++;
      }
      filename += `-${i}`;
    }
    filename += extname;
    await writeFile(nodePath.join(dir, filename));
    return nodePath.relative(config.paths.home, nodePath.join(dir, filename));
  }

  private _handleMessageReceive = async ({
    message: receivedMessage,
  }: MessageReceiveEventData) => {
    const { message_id: messageId, thread_id: threadId } = receivedMessage;
    const session_id = this._resolveSessionId(threadId);
    const userMessage: UserMessage = {
      id: messageId,
      session_id,
      role: "user",
      content: [
        await this._parseMessageContent(
          messageId,
          receivedMessage.message_type,
          receivedMessage.content,
        ),
      ],
    };
    this.emit("message:inbound", userMessage);
  };

  private _threadIdToSessionId = new Map<string, string>();

  /** Persist a thread→session mapping to DB and update the in-memory cache. */
  private _mapThreadToSession(threadId: string, sessionId: string) {
    this._threadIdToSessionId.set(threadId, sessionId);
    this._db
      .insert(feishuThreads)
      .values({
        thread_id: threadId,
        session_id: sessionId,
        created_at: Date.now(),
      })
      .onConflictDoNothing()
      .run();
  }

  /** Resolve a session ID from a thread ID, falling back to DB then generating a new one. */
  private _resolveSessionId(threadId: string | undefined): string {
    if (threadId && this._threadIdToSessionId.has(threadId)) {
      return this._threadIdToSessionId.get(threadId)!;
    }
    if (threadId) {
      const row = this._db
        .select({ session_id: feishuThreads.session_id })
        .from(feishuThreads)
        .where(eq(feishuThreads.thread_id, threadId))
        .get();
      if (row) {
        this._threadIdToSessionId.set(threadId, row.session_id);
        return row.session_id;
      }
    }
    return uuid();
  }

  private async _parseMessageContent(
    messageId: string,
    type: string,
    content: string,
  ): Promise<TextMessageContent> {
    const json = JSON.parse(content);
    if (type === "text") {
      return {
        type: "text",
        text: json.text,
      };
    } else if (type === "post") {
      const markdown = await convertPostToMarkdown(
        json,
        this.downloadMessageResource.bind(this, messageId),
      );
      return {
        type: "text",
        text: markdown,
      };
    } else if (type === "image") {
      const file_key = json.image_key as string;
      const path = await this.downloadMessageResource(messageId, file_key);
      return {
        type: "text",
        text: `![user_uploaded_image](${path})`,
      };
    } else if (type === "file") {
      const file_key = json.file_key as string;
      const file_name = json.file_name as string;
      const path = await this.downloadMessageResource(
        messageId,
        file_key,
        file_name,
      );
      return {
        type: "text",
        text: `A new file message uploaded to \`${path}\``,
      };
    } else {
      this._logger.error(`Unsupported message type: ${type}`);
      return { type: "text", text: "Unsupported message type" + type };
    }
  }
}
