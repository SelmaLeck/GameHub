# Vullco Associations v7

Stream-freundliches Assoziationsspiel mit zwei Modi:

- **Privat**: Lobby, Name + Lobby-Code, beliebig viele Spieler, Reveal durch Host.
- **Twitch-Chat**: Streamer antwortet zuerst; danach werden Twitch-Chat-Nachrichten live als Antworten gesammelt und beim Reveal als Top 5 mit Prozenten gezeigt.


## Neu in v7

- komplett ueberarbeitete Startseite mit Stream-Game-Look, Vorschau und klarerem CTA
- Streamer-Antwortfeld im Twitch-Modus kompakt unten links/rechts
- Facecam-Hinweis stark verkleinert
- globale Fussnote auf jeder Seite: **Made by Selma** + **Inspired by Papaplatte & Team**
- keine neue Supabase-Migration noetig

## Neue Navigation

1. Startseite -> **SPIELEN**
2. Auswahl:
   - **Privat** -> Lobby erstellen / beitreten
   - **Mit Twitch-Chat** -> ohne Lobby direkt in den Chat-Modus

## Twitch-Chat-Modus

Ablauf pro Runde:

1. Begriff erscheint in der Mitte.
2. Streamer tippt seine Antwort im seitlichen Facecam-Bereich ein.
3. Erst nach **ABSCHICKEN** beginnt die App, Chat-Antworten zu zaehlen.
4. Pro Twitch-Account zaehlt genau die erste gueltige Antwort der Runde.
5. Nachrichten, die mit `!` beginnen, werden ignoriert, damit typische Bot-Commands nicht als Antwort zaehlen.
6. Bei **REVEAL** stoppt die Sammlung.
7. Streamer-Antwort + Top 5 des Chats erscheinen mit Stimmenzahl und Prozentanteil.
8. **NAECHSTE RUNDE** setzt alles zurueck und waehlt einen neuen Begriff.

Die Prozentwerte beziehen sich auf die Anzahl eindeutiger Twitch-Accounts, die in dieser Runde eine gueltige Antwort abgegeben haben.

## Facecam-Bereich

Das Streamer-Antwortfeld sitzt auf Desktop kompakt **unten links** oder **unten rechts**. Direkt darueber steht nur noch ein kleiner Hinweis **FACECAM HIER DRUEBER**. In OBS legst du deine Kamera ueber diesen Bereich, damit der Chat die Eingabe nicht sieht.

Mit **Cam links/rechts** wechselst du die Ecke. Auf kleineren Displays rutscht der Bereich automatisch unter das Spiel, damit nichts ueberlappt. Die Antwort kann zusaetzlich im Browser ausgeblendet werden.

## Twitch Developer Setup

Du brauchst eine eigene Twitch Application.

### Redirect URLs

In der Twitch Developer Console bei deiner Application folgende Redirect URLs eintragen:

```text
http://localhost:3000/api/twitch/callback
https://DEINE-DOMAIN.vercel.app/api/twitch/callback
```

Wenn du spaeter eine eigene Domain verwendest, diese Callback-URL ebenfalls bei Twitch hinzufuegen.

### Environment Variables

Deine bestehende `.env.local` wird erweitert:

```env
NEXT_PUBLIC_SUPABASE_URL=https://DEIN-PROJEKT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_DEIN_KEY

TWITCH_CLIENT_ID=DEINE_CLIENT_ID
TWITCH_CLIENT_SECRET=DEIN_CLIENT_SECRET
```

**Wichtig:** `TWITCH_CLIENT_SECRET` darf niemals `NEXT_PUBLIC_` bekommen und nicht in GitHub committed werden. Er wird nur in den Next.js API Routes verwendet.

Danach:

```bash
npm run dev
```

Auf Vercel dieselben zwei Twitch-Werte unter **Project -> Settings -> Environment Variables** eintragen und neu deployen.

## Twitch-Berechtigung

Der Chat-Modus fordert nur `user:read:chat` an. Die App schreibt nichts in den Twitch-Chat. Der Streamer verbindet den Twitch-Account, dessen Kanal gelesen werden soll.

Technisch nutzt die Seite Twitch EventSub `channel.chat.message` ueber WebSocket. Die Twitch-OAuth-Tokens werden in einer verschluesselten HttpOnly-Cookie-Session gehalten; der Twitch Client Secret bleibt serverseitig.

## Supabase

Fuer v7 ist **keine neue Supabase-Migration** notwendig. Der Privat-Modus nutzt weiterhin dein vorhandenes v3/v4/v5-Schema.

Bei einem komplett frischen Supabase-Projekt einmal `supabase/schema.sql` ausfuehren.

## Lokaler Privat-Test

Private Spieler koennen weiterhin in mehreren Browser-Tabs getestet werden, da die Spieler-ID in `sessionStorage` liegt.

## Vercel

GitHub-Repo in Vercel importieren und diese Environment Variables setzen:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
TWITCH_CLIENT_ID
TWITCH_CLIENT_SECRET
```

Danach die Vercel-Callback-URL in deiner Twitch Application registrieren.
