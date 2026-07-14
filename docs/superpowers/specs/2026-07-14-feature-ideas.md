# Feature-Ideen — Sammlung für Review (Stand 2026-07-14 Nacht)

> Nur recherchiert & gesammelt, NICHTS umgesetzt. Zum gemeinsamen Durchgehen.

## Sofort sinnvoll (kleiner Aufwand, hoher Nutzen)

- **"Zum Kalender hinzufügen"** — iCal-Export/Share-Sheet pro Event (Apple/Google Kalender). Sehr wenig Aufwand, Nutzer nehmen App danach nicht mehr in die Hand bis Event.
- **Event teilen (WhatsApp/Share-Sheet)** — Deep-Link pro Event. In DE ist WhatsApp-Teilen der wichtigste virale Kanal für genau solche Feste — Familie/Verein teilt es weiter, kostenlose Reichweite.
- **Favoriten/Merkliste** — Event speichern, eigene Liste in Profil. Basis für spätere Erinnerungen.
- **Push-Erinnerung** — "Event X startet in 2h" für gemerkte Events. Erster echter Grund, die App offen zu lassen/wiederzukommen.
- **Wetter-Badge auf Event-Karte** — Weinfeste/Dorffeste sind outdoor; Wettericon (z. B. Open-Meteo, kostenlos, kein Key nötig) direkt auf der Karte spart Nutzern eine zweite App.
- **Leerer-Radius-Hinweis verbessern** — aktuell rendert Feed bei 0 Treffern einfach leer (laut rf-Plan Task 5 "expected, not a bug"). Für echten Nutzer: Hinweistext + "Radius vergrößern"-Button wäre die naheliegende UX-Fortsetzung.

## Mittelfristig (mehrere Sessions)

- **User-generated Events / Crowdsourcing** — Formular "Event fehlt? Hier eintragen". Wichtig, weil laut Design-Doc die Scraper-Abdeckung in der Startregion lückenhaft ist (kein iCal/RSS/Schema.org gefunden, nur 2 CMS-Familien als Hebel). Crowdsourcing schließt die Lücke schneller als neue Adapter zu bauen. Braucht einfache Moderation (Report-Button reicht am Anfang).
- **Kategorie-Filter im Feed/Karte** — Chips für Weinfest/Dorffest/Vereins-Sportfest/Konzert/Markt/Sonstiges (Farbwerte existieren schon in `eventDisplay.ts`). Aktuell kann man nur nach Radius filtern, nicht nach Kategorie.
- **Karten-Clustering** — bei vielen Events in einem Ort brauchen Pins Cluster (react-native-maps-clustering o.ä.), sonst überlagern sich Marker im Kaiserstuhl-Kerngebiet.
- **"Dieses Wochenende"-Ansicht** — gefilterte Sicht statt reiner chronologischer Liste; für Impuls-Nutzer ("was ist heute Abend los") relevanter als 25-km-Radius-Liste.
- **Regionswechsel/Reisemodus** — Standort manuell auf andere Region setzen ohne Heimat-Standort zu verlieren (z. B. Urlaub), passend zur Region-Agnostik-Architektur.
- **Mehrsprachigkeit (DE/EN)** — Kaiserstuhl ist touristisch (Naturgarten Kaiserstuhl als Quelle bereits im Design-Doc). Einfacher Spraway-Toggle würde Touristen erschließen.

## Später / Monetarisierung (aus Recherche, siehe Quellen unten)

- **Lokale Sponsoren-Platzierung** — z. B. ein "gesponsertes Event" oder Local-Business-Badge oben im Feed, dezent. Vereinsfeste/Weingüter als zahlende Partner statt generischer Werbung — passt zur Zielgruppe besser als klassische Banner-Ads.
- **Vereins-/Veranstalter-Self-Service** — Verein kann eigenes Event direkt einreichen/pflegen (statt nur Scraper-Daten) — reduziert Datenpflege-Aufwand UND ist ein potenzieller kleiner Bezahl-Baustein (Hervorhebung, "Top gesetzt").
- **Affiliate/Ticket-Passthrough** — für die wenigen ticketpflichtigen Events (Konzerte) Link zu bz-ticket o.ä. mit Tracking, kleine Provision. Kein eigenes Ticketing bauen.
- Quellen (Recherche, nicht handlungsleitend, nur Ideengeber):
  - [15+ must-have event app features for 2026 (Zoho Backstage)](https://www.zoho.com/backstage/event-app-features.html)
  - [How Hyperlocal Community Engagement Apps Transform Local Bonds](https://www.strikingly.com/blog/posts/hyperlocal-community-engagement-apps-transform-local-bonds)
  - [The Future of Hyperlocal Event Discovery is Here – Seeker](https://products.seeker.io/blog/the-future-of-hyperlocal-event-discovery-is-here/)
  - [Which Event App Features Can Be Monetized (Guidebook)](https://www.guidebook.com/post/which-event-app-features-can-be-monetized)
  - [How to Profit From Free Events (Purplepass)](https://www.purplepass.com/blog/how-to-profit-from-free-events-creative-strategies-to-monetize-your-gatherings/)

## Spielerei / nice-to-have (niedrige Priorität)

- **Home-Screen-Widget** ("nächstes Event in deiner Nähe") — iOS/Android Widget, guter Wiedereinstiegs-Hebel, aber Expo-Widget-Support ist zusätzlicher nativer Aufwand (EAS config plugin).
- **Badges/Gamification** ("5 Weinfeste besucht") — Profil hat bereits Stat-Zeile (Besucht/Freunde/Geplant) mit Demo-Zahlen; echte Zählung + Badges wäre logische Erweiterung, aber Freunde/Feed sind noch komplett Mock — erst real machen.
- **Foto-Galerie pro Event** (crowdsourced oder Hashtag-Aggregation) — schöner Social-Proof-Faktor, aber Moderationsaufwand nicht unterschätzen.
- **Barrierefreiheit-Infos pro Event** (rollstuhlgerecht, familienfreundlich) — kleines Datenfeld, großer Wert für die Zielgruppe, aber woher die Info nehmen (Scraper liefert das nicht) — vermutlich nur crowdsourced sinnvoll.
- **Fahrgemeinschaften/Parkplatz-Hinweis** — für ländliche Feste (ÖPNV oft dünn) evtl. simple "Mitfahren?"-Verlinkung zu bestehenden Diensten statt eigenem Feature.

## Offene technische Notiz (kein Feature, aber beim Feature-Brainstorm aufgefallen)

- `scraper/config/{regions,sources,templates}` sind laut Progress-Ledger noch leer (Task 14 Scraper-Core: "workflow will fail every 6h run until real region/source config JSON files are added"). Bevor viele der obigen Features Sinn ergeben, braucht es echte Daten im Feed — das ist der eigentliche Blocker, nicht neue UI-Features. Vorschlag: nächste große Session eher auf "erste echte Quellen-Configs für 2-3 Kaiserstuhl-Gemeinden" als auf weitere App-Features legen.
