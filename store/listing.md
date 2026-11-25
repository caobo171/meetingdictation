# Chrome Web Store listing — MeetingDictation 0.2.0

Paste each block into the matching field of the developer dashboard.

## Store listing tab

**Description**

```
Practise English listening on the recordings you already have.

MeetingDictation turns a recorded meeting or video into dictation practice. It hides the transcript, plays one line at a time, and you type what you hear straight into the transcript. Submit a line to see what you got right, what you missed, and the full sentence.

Works on:
• Microsoft Teams meeting recordings (Recap and Stream)
• Loom videos
• YouTube videos with captions
• Any other captioned video: click the toolbar button

Features:
• Blanks right in the transcript, so you never lose your place
• Choose how many words are hidden (25% to 100%)
• Replay, skip back or forward, loop a line, slow it down
• Hints and "show answer" when you are stuck
• A clear result for every line: right words, missed words, the full sentence
• Keyboard shortcuts for everything (Tab to the next word, Enter to submit)
• Optional free account at meetingdictation.com to keep your progress and streak across devices

Your recordings stay where they are: MeetingDictation reads the transcript the page already shows and never uploads your audio or video.
```

**Category:** Education
**Language:** English

**Store icon (128×128):** `apps/extension/icons/icon-128.png`

**Screenshots (1280×800):** `store/screenshot-1-youtube.png`

**Official URL / Homepage URL:** `https://meetingdictation.com`
**Support URL:** `https://meetingdictation.com/privacy` (contact email is on that page)

## Privacy tab

**Single purpose**

```
Listening practice on recorded videos: the extension hides a video's transcript and lets the user type each line they hear, then shows what they got right.
```

**Permission justification — storage**

```
Saves the learner's answers and progress per video, their settings (keyboard shortcuts, skip time, panel size) and, if they connect an account, the sign-in token, so practice continues where they left off.
```

**Permission justification — activeTab**

```
When the user clicks the toolbar button on a page that is not one of the built-in video sites, the extension needs access to that tab to find its video and captions and open the practice panel there.
```

**Permission justification — scripting**

```
Used together with activeTab: on a toolbar click, the extension injects its practice panel into the current tab. It does nothing on pages where the user did not click.
```

**Host permission justification**

```
The extension runs only on video pages it supports: Loom share/embed pages, YouTube, Microsoft Teams and Microsoft Stream on SharePoint, to read the page's own transcript and show the practice blanks next to it. meetingdictation.com is the extension's own website, used to connect an optional account and sync progress.
```

**Remote code:** No, I am not using remote code.

**Data usage** — tick:
- Personally identifiable information (email, only when the user connects an account)
- Website content (video title and URL of the video being practised, and the user's typed answers)

Then tick all three certifications (not sold to third parties, not used for unrelated purposes, not used for creditworthiness).

**Privacy policy URL:** `https://meetingdictation.com/privacy`

## Distribution tab

Free, all regions, Public.
