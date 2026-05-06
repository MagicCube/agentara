---
name: video-storyboard
description: Generate storyboard image boards and matching video-generation prompt scripts for specific scenes in a short video plan. Use this skill whenever the user asks to create a storyboard, storyboard image, video prompt script, scene prompt, image-to-video prompt, shot board, or per-scene video-generation package, especially when they specify a scene number, duration, or an existing video plan. This skill saves outputs as storyboard/scene-XX.png and storyboard/scene-XX.md and enforces grid sizing, timing labels, and strict character, wardrobe, prop, and location continuity.
---

# Video Storyboard

Use this skill to create a production-ready storyboard package for a specific scene:

1. A storyboard image saved to `storyboard/scene-XX.png`.
2. A video-generation prompt script saved to `storyboard/scene-XX.md`.

Write the skill instructions in English, but create the user-facing `.md` script in the user's preferred local language unless they explicitly request another language.

## When to Use

Use this skill when the user asks for any of the following:

- Generate a storyboard for a scene.
- Turn a scene from a video plan into storyboard frames.
- Create prompts for generating video from storyboard panels.
- Save a storyboard image and prompt script for `scene-01`, `scene-02`, etc.
- Build a grid storyboard with per-panel timing labels.

If the user only asks for a storyboard image, still consider whether a matching `.md` prompt script is expected from the workflow. If unclear, ask one concise question or proceed with both files when the user has previously used this workflow.

## Inputs to Extract

Before generating, identify:

- Scene number.
- Scene duration.
- Scene source: existing plan, prior conversation, user prompt, uploaded image, or file.
- Aspect ratio of the final video, usually `16:9` unless specified.
- Characters and identity constraints.
- Available character design assets: `.png` character sheets, `.md` character specs, turnarounds, casting references, or prior approved character images.
- Wardrobe, props, brand/product details, and location.
- Visual style and references.
- Required output language for the `.md` prompt script.

If the scene number is missing, ask for it. If duration is missing, infer it from the referenced plan; otherwise ask or choose a practical default only if the user wants you to proceed.

## Output Paths

Always use a two-digit scene number:

- Scene 1 -> `storyboard/scene-01.png` and `storyboard/scene-01.md`
- Scene 2 -> `storyboard/scene-02.png` and `storyboard/scene-02.md`
- Scene 12 -> `storyboard/scene-12.png` and `storyboard/scene-12.md`

Create `storyboard/` if it does not exist.

Do not overwrite existing storyboard files unless the user asked for regeneration or replacement. If a target file exists, either ask before replacing or write a clear revision path such as `scene-01-v2.png` if the user requested alternatives.

## Grid Rules

Choose grid size from the scene duration:

| Scene Duration | Grid | Panel Count |
| ---: | --- | ---: |
| `<= 9s` | `3 rows x 3 columns` | 9 panels |
| `> 9s` and `<= 12s` | `4 rows x 3 columns` | 12 panels |
| `> 12s` | `4 rows x 4 columns` | 16 panels |

Each panel must be `16:9`.

There must be no gaps between panels. Use thin black panel borders only if needed for readability, but do not insert gutters or spacing.

If the duration does not divide evenly, allocate practical panel durations. Prefer simple labels such as `0.5s`, `1s`, `1.5s`, `2s`, or exact ranges when helpful. Empty final panels are allowed for very short scenes, but only when filling every panel would over-fragment the action. Empty panels should be plain black.

## Storyboard Image Requirements

Generate one single storyboard sheet, not separate images.

If the current context includes a character design image, approved character sheet, turnaround sheet, or character reference `.png`, use it as an image reference for the storyboard image generation. Do not rely on text description alone when a character design image is available. This is required to preserve identity, face, hairstyle, body proportions, wardrobe, and material details across scenes.

If both a character `.md` spec and `.png` sheet exist, read the `.md` for written constraints and feed the `.png` to the image-generation model as the visual reference.

Every visible panel must include:

- A black rectangle in the top-left corner with the panel number in white text, starting from `1`.
- A black rectangle in the top-right corner with the panel duration in white text, such as `0.5s`, `1s`, or `1.5s`.
- A clear shot composition that corresponds to the panel's beat.

Critical continuity requirements:

- Keep the same character identity across all panels.
- Keep face, age, hairstyle, body type, and skin tone consistent.
- Keep wardrobe consistent unless the scene explicitly includes a costume change.
- Keep key props consistent, including product shape, color, bottle/can design, bag, camera, vehicle, or luggage.
- Keep location geography consistent: doors, windows, roads, vending machines, classrooms, landmarks, field direction, and light direction should not jump randomly.
- Keep the time of day and weather consistent unless the scene explicitly transitions.

When generating the image prompt, state continuity requirements explicitly and repeatedly enough for the image model to respect them. This matters more than decorative styling.

When using a character design reference image, explicitly tell the image model that the storyboard character must match that reference: same face, hairstyle, age, body proportions, outfit, shoes, accessories, clothing material, and color palette. The scene may change pose, action, camera angle, and lighting, but not the character design.

Avoid:

- AI-looking faces, waxy skin, distorted hands, extra fingers.
- Random changes in clothing, hair, props, or background.
- Uncontrolled readable text or broken brand typography.
- Extra logos, subtitles, speech bubbles, UI overlays, or watermarks.
- Overly cinematic fantasy lighting if the scene should feel real.

For brand/product work, prefer "brand-color and product-form cues" unless the user provides official assets. Generated text on packaging is often unreliable.

## Recommended Image Prompt Structure

Use this structure for the image generation prompt:

```text
Create a single storyboard sheet for Scene [XX], [duration] seconds, [video aspect/style].

Use the provided character design image as the primary visual reference for the character. Match the same face, hairstyle, body proportions, wardrobe, shoes, accessories, clothing material details, and color palette across all panels.

Grid: [3x3 / 4x3 / 4x4], every panel is 16:9, no gaps between panels.
Panel labels: top-left black label with white panel number; top-right black label with white duration.

Continuity is critical: the same [character description] appears consistently across all panels, same face, same hairstyle, same wardrobe, same props, same location geography, same lighting direction, same time of day.

Scene summary: [one concise scene summary].
Visual style: [photorealistic / cinematic / documentary / commercial / handheld / natural light].

Panels:
1. [duration] - [shot type, action, composition]
2. [duration] - [shot type, action, composition]
...

Negative constraints: no subtitles, no extra logos, no watermarks, no distorted text, no inconsistent character, no clothing changes, no prop changes, no AI-smooth skin, no deformed hands.
```

## Video Prompt Script Requirements

After creating the image, write a matching `.md` file for video generation.

The script should let a video model generate a single continuous scene from the storyboard. It should describe continuity, style, shot timing, character action, sound design, editing rhythm, and negative prompts.

Use the user's preferred local language for the script. If the user wrote in Chinese, write the `.md` in Chinese.

Use this structure:

```markdown
根据上传的 01-[NN] 分镜图，生成一段 [duration] 秒 [style] 场景。

[Continuity paragraph: same characters, wardrobe, props, location, time of day.]

[Restrictions paragraph: no subtitles, no voiceover unless requested, no extra logos, no readable text if risky.]

风格：[visual style, camera feel, color, texture.]

节奏：[overall edit rhythm.]

---

## 01 | 00:00-00:00.5

[Panel description.]

[Character action.]

[Camera movement / shot type / transition.]

---

## 02 | 00:00.5-00:01.0

[...]

---

## 声音设计

[Natural sound, music, transitions, sound bridges.]

## 剪辑建议

[How the panels should connect into motion.]

## 负向提示词

- [No subtitles]
- [No extra logos]
- [No inconsistent character]
- [No wardrobe changes]
- [No prop changes]
- [No unreadable or distorted text]
```

Translate the headings if the user requested English or another language.

## Timing Rules for the Script

The `.md` script must match the storyboard image:

- Same panel count as the grid, unless some final panels are intentionally blank.
- Same per-panel durations as the image labels.
- Timecodes add up exactly to the scene duration.
- Each panel describes a single visual beat, not a full mini-scene.
- Fast scenes can use 0.5s beats; slower scenes can use 1s-2s beats.

For a 5-second 3x3 board, a good default is:

- Panels 1-8: `0.5s` each.
- Panel 9: `1s`.

For a 9-second 3x3 board, a good default is:

- Panels 1-9: `1s` each.

For a 12-second 4x3 board, a good default is:

- Panels 1-12: `1s` each.

For a 15-second 4x4 board, a good default is:

- Panels 1-14: `1s` each.
- Panel 15: `0.5s`.
- Panel 16: `0.5s`.

Adjust these when the scene's action needs different emphasis.

## Workflow

1. Read the relevant plan, previous scene script, existing storyboard, or user-provided scene description.
2. Search the current context and project for relevant character design assets, especially `characters/*.png`, approved character sheets, turnarounds, and matching `{character-name}.md` specs.
3. If a relevant character design image exists, include it as a reference image when generating the storyboard. This is required for character consistency.
4. Extract the scene's duration, story purpose, characters, wardrobe, props, location, camera language, and edit beat.
5. Choose the grid size from the duration.
6. Draft panel beats with exact durations and timecodes.
7. Generate the storyboard image with the image-generation tool, using any available character design image as a visual reference.
8. Save or copy the generated image to `storyboard/scene-XX.png`.
9. Inspect the image if possible. Verify grid, labels, continuity, and obvious visual artifacts.
10. Write `storyboard/scene-XX.md` using the same panel timing and descriptions.
11. Final response should include the saved file paths and, when supported, render the image with a Markdown image tag using an absolute path.

## Quality Checklist

Before finishing, verify:

- `storyboard/scene-XX.png` exists.
- `storyboard/scene-XX.md` exists.
- The scene number is two digits.
- The grid size matches the duration rule.
- Any available character design image in context was used as a reference image for generation.
- Every non-empty panel has a number label and duration label.
- The panel durations add up to the scene duration.
- The `.md` script matches the image panel order.
- Character continuity is explicitly stated in both the image prompt and `.md` script.
- Wardrobe, props, and location consistency are explicitly stated.
- The output language of the `.md` script matches the user's preference.

## Example: 5-Second Commercial Scene

User asks:

```text
Create storyboard and video prompt for Scene 01: 5-second campus sports drink TVC opener.
```

Use:

- Grid: `3x3`.
- Panels: 9.
- Timing: first 8 panels `0.5s`, final panel `1s`.
- Output files: `storyboard/scene-01.png`, `storyboard/scene-01.md`.
- Continuity emphasis: same student, same school uniform, same blue-white drink bottle, same morning campus location.

Example panel plan:

| Panel | Duration | Beat |
| ---: | ---: | --- |
| 1 | 0.5s | Vending machine close-up in morning campus light |
| 2 | 0.5s | Bottle drops into pickup slot |
| 3 | 0.5s | Student's hand reaches for bottle |
| 4 | 0.5s | Bottle lifted, condensation catches light |
| 5 | 0.5s | Student looks toward sports field |
| 6 | 0.5s | Wide shot of school gate |
| 7 | 0.5s | Student starts moving along campus path |
| 8 | 0.5s | Low-angle sneaker first running step |
| 9 | 1s | Super-wide reveal toward track field |
