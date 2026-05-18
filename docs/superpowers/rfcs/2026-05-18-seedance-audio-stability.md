# RFC: Seedance Audio Stability For AIGC Video Skills

Status: Draft
Author: luna
Date: 2026-05-18

## Summary

Agentara's current video-related skills cover planning, character design,
storyboarding, and poster design. They do not yet define a production workflow
for stable generated voices across multiple AI-video segments.

This RFC proposes an audio-stability workflow for Seedance-style video
generation, based on the Dodo/Wangwang 45-second production run.

## Current Agentara Skill Coverage

Relevant skills inspected:

- `user-home/.claude/skills/video-plan/SKILL.md`
  - Covers duration, scenes, dialogue/voiceover suggestions, and editing notes.
  - Does not describe voice identity references, speaker mapping, or audio
    reference assets.
- `user-home/.claude/skills/video-storyboard/SKILL.md`
  - Covers storyboard images and per-scene video prompts, including sound
    design.
  - Does not define native generated-audio preservation, audio-reference
    preflight, or multi-segment voice consistency rules.
- `user-home/.claude/skills/video-character-design/SKILL.md`
  - Covers visual character identity.
  - Does not model character voice identity.
- No dedicated Agentara default skill was found for Seedance video generation
  with reference audio.

Conclusion: Agentara currently has good visual pre-production skills, but no
explicit audio-stability skill layer for recurring speaking characters.

## Seedance Constraints Observed

These are empirical constraints and workflow lessons from the Dodo/Wangwang
production. Treat them as conservative production rules until better provider
documentation or tests supersede them.

### 1. Prompt-only voice locking is insufficient

Stable voice identity requires a reference audio input:

- send each voice as an audio URL with `role: "reference_audio"`;
- set `generate_audio: true`;
- bind each reference to a named character in the prompt.

The prompt is still required, but its job is binding, not voice identity by
itself. Example:

```text
Audio reference 1 is Dodo's voice. Dodo must always use audio reference 1.
Audio reference 2 is Wangwang's voice. Wangwang must always use audio reference 2.
Only these named speakers talk. Use the exact dialogue below.
```

### 2. Multi-reference audio has a total duration limit

A validation request with two 15-second references failed. The error required
the combined reference-audio duration to be about `<=15.2s`.

Production rule:

- keep a full 15-second or longer voice record for review and archive;
- cut a clean short reference clip for Seedance generation;
- for two speakers, use about 7 seconds per speaker;
- verify total reference-audio duration before submission.

### 3. Audio-reference mode should not mix with strict first/last frames

In the observed Studio/Seedance path, reference audio is a multimodal reference
input. It should not be combined with strict `first_frame` / `last_frame` image
control in the same task.

Production rule:

- for voice-stable native audio, use `reference_image` + `reference_audio`;
- do not submit strict first/last-frame inputs in the same task;
- if transition control is required, run a separate visual-control pass or use
  returned/generated last frames after the native audio pass.

### 4. Preserve native audio during assembly

For a native voice-consistency test, final assembly must preserve each
Seedance-generated segment's original audio.

Do not replace generated segment audio with external TTS/SFX/music in the same
deliverable. A post-produced audio version can exist as a separate fallback, but
it should be labeled as such.

### 5. Reference assets must be durable remote URLs

Seedance/Ark must be able to fetch every reference URL at submission time. In
the Dodo/Wangwang run, two 7-second reference-audio URLs temporarily returned
404, and every segment failed immediately with an `audio_url resource not
found` error.

Production rule:

- store reference audio in the media repo, not in temporary local files;
- verify direct URL reachability before submitting;
- keep local source clips so the same hash/object can be re-uploaded if needed;
- record URLs and hashes in a manifest.

## Proposed Agentara Workflow

Add a voice-stability workflow to Agentara's AIGC video skills.

### Phase 1: Voice Asset Selection

For each recurring speaking character:

1. Generate or select a clean full voice record.
2. Store it in the media repo as the canonical voice record.
3. Cut a short Seedance reference clip.
4. Store the short clip in the media repo.
5. Record both URLs in a project voice registry.

Example registry shape:

```json
{
  "characters": {
    "dodo": {
      "full_audio_url": "https://image.zaynjarvis.com/i/uploads/studio/sha256/...",
      "reference_audio_url": "https://image.zaynjarvis.com/i/uploads/studio/sha256/...",
      "reference_duration_seconds": 7.0,
      "prompt_voice": "cute young female Mandarin voice, bright and soft"
    },
    "wangwang": {
      "full_audio_url": "https://image.zaynjarvis.com/i/uploads/studio/sha256/...",
      "reference_audio_url": "https://image.zaynjarvis.com/i/uploads/studio/sha256/...",
      "reference_duration_seconds": 7.0,
      "prompt_voice": "natural young Mandarin boy voice, warm and earnest"
    }
  }
}
```

Recommended location:

```text
workspace/projects/<project>/voices.json
```

### Phase 2: Video Plan Integration

Extend `video-plan` output with optional audio fields when dialogue or recurring
voices matter:

- character voice registry path;
- spoken language;
- per-scene speaker list;
- line-level dialogue;
- whether background music is deferred;
- whether the pass is `native_audio_validation` or `post_audio_fallback`.

### Phase 3: Storyboard / Prompt Integration

Extend `video-storyboard` prompt scripts with an optional "Voice References"
section:

```markdown
## Voice References

- Audio reference 1: Dodo, cute young female Mandarin voice.
- Audio reference 2: Wangwang, natural young Mandarin boy voice.

Rules:
- Dodo only uses audio reference 1.
- Wangwang only uses audio reference 2.
- No narrator.
- No background music in the native-audio pass.
```

Each dialogue line should have an explicit speaker label.

### Phase 4: Generation Preflight

A future Seedance generation skill or helper should preflight:

- reference-audio URLs return HTTP 200;
- MIME type is audio;
- max reference-audio count is 3;
- known total reference-audio duration is about `<=15.2s`;
- no local-only reference paths are passed to provider APIs;
- reference audio is not mixed with strict first/last-frame controls;
- each segment prompt binds every supplied audio reference to a speaker.

### Phase 5: Assembly Verification

For multi-segment native-audio output:

1. Download every successful segment immediately.
2. Probe every segment with `ffprobe`.
3. Require an audio stream in each segment.
4. Concatenate original generated segment audio.
5. Probe final duration, dimensions, and audio stream.
6. Create a review copy and contact sheet.

## Dodo/Wangwang Reference Case

Canonical full voices selected by the user:

- Dodo:
  `https://image.zaynjarvis.com/i/uploads/studio/sha256/094ff97848cd56f67291e43361ce53818f11c10c96b72b1241911f390a495005`
- Wangwang:
  `https://image.zaynjarvis.com/i/uploads/studio/sha256/e6f687af057d3e7b1942d54462a9b2a6dbe8653400d36d665e09c0acc58ad631`

Short Seedance references:

- Dodo 7s:
  `https://image.zaynjarvis.com/i/uploads/studio/sha256/8f5974daa14a8425a003b4a7c9b17533b8fbfb4572b39bf483245d7a034ab963`
- Wangwang 7s:
  `https://image.zaynjarvis.com/i/uploads/studio/sha256/191a880ba717e103afa4a798f0dc3d422db8529c534a85fb95bb1968f5d3451d`

Successful 45-second native-audio video:

`https://image.zaynjarvis.com/i/uploads/studio/sha256/de4eaacd66f3df3c15c2c1ac0d3eef41d2c4600ffb1e9b86f3c9c04ab5e4dd10`

## Proposed Changes

### Documentation

- Add this RFC under `docs/superpowers/rfcs/`.
- Add short audio-stability notes to `video-plan` and `video-storyboard`.
- Add a new dedicated skill later if Seedance generation is installed into
  Agentara default skills.

### Skill Behavior

For any future AIGC video generation skill:

- recognize "fixed voice", "same voice", "voice consistency", "reference
  audio", "native audio", and "Seedance voice" as triggers;
- require or infer a voice registry for recurring characters;
- use a "native-audio validation" pass before accepting external audio
  replacement;
- keep post-produced TTS/music as a separate optional pass.

### CLI / Helper Behavior

If Agentara ships a Seedance helper script, add:

```bash
--reference-audio URL        repeatable
--reference-audio-label NAME repeatable
--voice-registry FILE
--voice-stable              enables stricter preflight
--dry-run                   prints payload without submitting
```

## Validation Plan

1. Unit-test prompt/registry parsing if helper code is added.
2. Preflight-test unreachable audio URL, overlong reference duration, too many
   references, and mixed first/last-frame + audio inputs.
3. Run a short two-speaker Seedance validation clip.
4. Run a multi-segment 45-second native-audio production.
5. Verify final assembly keeps original generated audio.

## Open Questions

- Is the `<=15.2s` limit always total across all reference audio clips, or does
  it vary by model/account? Treat it as total until proven otherwise.
- Should Agentara store voice registries under `workspace/projects/<project>/`
  or in `memory/` for reuse across projects?
- Should the first implementation be a dedicated `seedance-video-generation`
  skill, or should existing `video-plan` and `video-storyboard` carry the
  workflow until a provider-specific generator exists?
