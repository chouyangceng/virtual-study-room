# Virtual Study Room - Design Spec

## Overview
A single-page virtual study room web application with pomodoro timer, ambient sounds, task management, and focus statistics. Pure frontend, data persisted via localStorage.

## Tech Stack
- HTML5 / CSS3 / Vanilla JS (ES6+)
- Chart.js CDN for statistics charts
- Unsplash API for background images
- Web Audio API for sound mixing

## File Structure
```
virtual-study-room/
├── index.html          # Main entry
├── css/
│   └── style.css       # All styles (~800 lines)
├── js/
│   ├── app.js          # App init, state management, navigation
│   ├── timer.js        # Pomodoro timer logic
│   ├── tasks.js        # Todo list CRUD
│   ├── stats.js        # Statistics & charts
│   ├── audio.js        # Ambient sound player
│   └── background.js   # Background image management
└── assets/
    └── sounds/          # Local audio fallbacks (generated via Web Audio API oscillators)
```

## Data Model (localStorage)

### tasks
```json
[{ "id": "uuid", "text": "复习高数", "completed": false, "createdAt": 1700000000 }]
```

### focusSessions
```json
[{ "date": "2026-06-10", "duration": 1500, "type": "work", "timestamp": 1700000000 }]
```

### settings
```json
{
  "workDuration": 25, "breakDuration": 5, "longBreakDuration": 15,
  "sessionsBeforeLongBreak": 4, "theme": "light", "volume": 0.5,
  "selectedSound": "rain", "musicVolume": 0.3
}
```

### achievements
```json
[{ "id": "first_session", "name": "初次专注", "unlockedAt": 1700000000 }]
```

## Component Layout

```
┌──────────────────────────────────────────────┐
│  Top Bar: Logo | Stats | Achievements | Theme │
├────────┬──────────────────┬──────────────────┤
│        │                  │                  │
│  Task  │   Pomodoro       │   Session Info   │
│  List  │   Timer          │   Today: 2h 30m  │
│        │   (Circular)     │   Streak: 5 days │
│        │                  │                  │
│        │   Controls       │                  │
│        │   [Start][Reset] │                  │
│        │                  │                  │
├────────┴──────────────────┴──────────────────┤
│  Audio Bar: Sound Select | Volume | Now Playing│
└──────────────────────────────────────────────┘
```

## Features Detail

### 1. Pomodoro Timer
- Circular SVG progress ring with countdown display
- Preset modes: 25/5 (default), 45/10, 50/10, custom
- Auto-switch work ↔ break with notification sound
- Visual color change: work=warm orange, break=calm green
- Session counter tracking toward long break

### 2. Background System
- Unsplash API random high-res images (nature, cozy, minimal)
- Refresh button for new image
- Dark overlay (adjustable opacity) for text readability
- Fallback: 5 curated local gradient backgrounds

### 3. Audio System
- White noise options: rain, cafe, fireplace, ocean, forest
- Light music: 3 lo-fi tracks (generated tones as fallback)
- Independent volume sliders for noise and music
- Play/pause toggle, mute button
- Audio context resumes on user interaction (browser policy)

### 4. Task List
- Add task (input + enter), checkbox to complete, X to delete
- Completed tasks move to bottom with strikethrough
- Clear all completed button
- Today's date header

### 5. Statistics (Modal View)
- Today: focus time ring chart, sessions count
- Weekly: daily bar chart (Mon-Sun)
- Monthly: heatmap grid (like GitHub contribution graph)
- All-time: total hours, streak, achievements
- Export data as JSON button

### 6. Achievements
- First session, 10 sessions, 50 sessions, 100 sessions
- 1-hour streak, 3-day streak, 7-day streak, 30-day streak
- Early bird (session before 8am), Night owl (session after 10pm)
- Task master (complete 10 tasks), Centurion (100 tasks)

### 7. Theme
- Light/Dark mode toggle
- CSS custom properties for seamless switching

## States & Edge Cases
- First visit: show onboarding tooltip highlights
- Empty task list: show encouraging placeholder
- No sessions yet: show "开始你的第一次专注吧!" CTA
- Audio autoplay blocked: show "点击任意位置开始" prompt
- localStorage full: catch quota errors, warn user
- Offline: all features work except Unsplash (falls back to gradients)
