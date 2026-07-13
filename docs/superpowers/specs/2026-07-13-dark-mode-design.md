# Dark Mode for the Demo App

## Goal

Add a dark mode to `app/src/demo/` (the prototype scaffold shown in
`App.tsx`) so the user can toggle between light and dark appearance.
Scope is the demo app only — this is the prototype used to validate
UX before the real app is built.

## Toggle behavior

- Manual toggle only. No system-preference following in this iteration.
- Selection persists across reloads via `@react-native-async-storage/async-storage`
  (already a project dependency), under key `demo.darkMode`.
- On startup, the provider reads the stored value. If read fails or
  no value exists, default to light. No loading spinner — the app
  renders in light mode until/unless the stored value resolves to dark,
  which is an acceptable brief flash for this prototype.

## Architecture

New module `app/src/demo/theme.ts`:

- `lightColors` / `darkColors`: palettes covering the tokens currently
  hardcoded across the demo components — `background`, `surface`,
  `border`, `text`, `textMuted`, `accent` (near-black in light /
  near-white in dark), plus card-specific tokens (media tint overlay,
  tag background). Colors that are brand/semantic and don't invert
  (e.g. `heartActive` red `#b3123d`, per-friend avatar colors) stay
  fixed across both palettes.
- `ThemeContext` + `ThemeProvider`: holds `isDark` state, loads/saves
  it via AsyncStorage, exposes `{ colors, isDark, toggle }`.
- `useTheme()` hook: reads the context; throws if used outside the
  provider (dev-time bug guard, not a user-facing error path).

`DemoApp.tsx` wraps its existing return value in `<ThemeProvider>`,
placed outside the `webDesk`/`webPhone` wrapper so the desktop
backdrop also switches with the theme.

## Component migration

Each of `FeedScreen`, `TabBar`, `EventPostCard`, `ProfileScreen`,
`MapScreen`, `FriendsFeedScreen` currently defines its
`StyleSheet.create({...})` at module scope with literal hex colors.
Each moves the color-dependent styles inside the component body:

```ts
const { colors } = useTheme();
const styles = useMemo(() => StyleSheet.create({ ... colors.xxx ... }), [colors]);
```

Photos/images are untouched — only chrome (backgrounds, borders, text,
overlays, tag pills) switches with the theme.

## Profile toggle UI

`ProfileScreen`'s settings list gets a fourth row, "Dark Mode", using
`Switch` from `react-native` instead of the `›` chevron used by the
other three rows. `onValueChange` calls `toggle()` from `useTheme()`.
The existing three rows (Standort ändern, Benachrichtigungen, Über die
App) are unchanged — no behavior, chevron only.

## Error handling

AsyncStorage read/write failures are caught and ignored — falls back
to in-memory-only state for that session (light default). No user-
facing error surface; this is a demo-only preference, not critical
data.

## Testing

Manual verification only (no test framework changes):

- Toggle switch in Profil, confirm all 4 tabs re-render with dark
  palette and readable contrast (text vs. background).
- Reload the page/app, confirm the choice persisted.
- Toggle back to light, confirm full revert.
