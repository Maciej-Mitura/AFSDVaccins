Inhoud
Met de meest recente technologieën wordt een full stack webtoepassing gebouwd die in cloud omgevingen runt. We werken full stack op de volgende onderdelen:

Frameworks, Typescript based
Monorepo structuur & beheer
API (GraphQL)
NoSQL databases
Foutcontrole en beveiliging van API
Authenticatie & authorisatie
Testing (unit, integratie, end-to-end)
Realtime verbinding
Internationalisatie
PWA-technologie
CI/CD
Deployment met Docker containers
Monitoring & logging

Requirements:
TL;DR
Maak een project mét focus op realtime.
Gebruik de checklists, daar geven we ook de punten mee.
Let op dat je de verplichte documentatie voorziet.
Gebruik time-tracking / toggle.
Communiceer met ons over je code / project via Github (issues).
Deadline
Enkele tussentijdse deadlines die op Leho verschijnen.
Uiteindelijke deadline wordt nog gecommuniceerd.
Indienen
Deze opdracht dien je in a.d.h.v. jouw project repository op GitHub.
Je werkt individueel, en dient ook een ZIP-kopie van jouw repository in op Leho.
Introductie
Aan de hand van dit project is het de bedoeling om de verschillende full-stack web elementen, die aan bod komen in de cursus - Advanced Full Stack Web Development uit te testen of in te oefenen in één project.

Het maken van dit project is de perfecte voorbereiding op de examens. Aangevuld met eigen bestudeerde, eigen uitgewerkte onderwerpen maakt dit project een stap in de richting van stage of onderzoeksproject. Dit project kan zeer uitgebreid worden. Hoe ver je erin gaat heb je in eigen handen. Spendeer vooral tijd aan de verschillende ontwikkelingsaspecten om een basisapplicatie te kunnen demonstreren. Een zuiver copy/paste om alle data, alle mogelijkheden te voorzien is onnodig. Durf het aan om eerder nieuwe zaken uit te testen, wat zelfs resulteert in extra punten.
De opdrachtomschrijvingen zijn de vraag van de klanten. Werk deze zo goed mogelijk uit dat je een oplossing biedt voor de vraag van de klant.
Denk
Onderwerpen
Je kiest (per team) een van de volgende projecten. De volgende beschrijvingen tonen wat minimaal gevraagd wordt per onderwerp (=wat moet gepresenteerd worden op het einde).
Projecten
Zie fiche op Leho ( 📑 Projectfiches)
Benodigdheden
Voor deze opdracht kan je gebruik maken van:
De Docker containers uit de lessen
GitHub
Docker
Brains 🧠
Einddoel
Einddoel en Technische verwachtingen
Als einddoel wordt één waardige presentatie van zowel code als mogelijkheden van het volledige project verwacht (december).

Je presentatie start met een seeding van het project. Zorg voor goede data zodat je de flow en functionaliteit van je applicatie kan tonen.

Het uiteindelijke doel is dat je kan builden naar Docker dus ook de API en Frontend in afzonderlijke containers draaien. Zodat het project bijvoorbeeld op een opendeurdag kan opgestart worden.

Technisch neem je verschillende aspecten uit de labo’s op in het project => werk daarom zo snel mogelijk op jouw eigen project en gebruik de labo’s van onze module als voorbeelden.
De technische verwachtingen voor zowel frontend als backend staan hieronder vermeld in twee checklisten. Bij het indienen van het project dien je ook beide checklisten in. Vink aan wat je implementeert.
De checklists zijn ook beschikbaar als markdown.
Checklist Backend
Backend API
Is een Nest JS API die via Docker gehost wordt (lokaal)
Bonus als je het extern kan hosten
Database
Gegevens worden persistent gestockeerd in de meest passende datastructuur. Maak een goed onderbouwde keuze.
MongoDB
Realtime
Backend communiceert met frontend in realtime en vice versa met de gepaste protocollen.
Autorisatie en authenticatie
Firebase of dergelijke
PKCE flow gebruiken
Minimaal 2 rollen: gebruiker en administrator.
Admin is voorzien: “docent@howest.be” met paswoord “P@ssword123”
Kwetsbaarheid
CORS is enabled.
Extra beveiligingen tegen Cross Site Forgery, Cross Site Scripting.
API docs
Voornamelijk gebruik van GraphQL. Geen of beperkt gebruik van REST API.
De API documenteert zichzelf op basis van een self-documenting library.
(bv.: GraphiQL / Apollo playground)
Ook statuscodes bij foute condities worden gedocumenteerd.
Framework
Kies een goede manier om je project te structureren.
Via een seeder wordt de database bij opstarten van de applicatie automatisch aangemaakt.
Foutcontrole
Het crashen van de applicatie wordt verhinderd door het gebruik van een try/catch structuur waarbij de oorzaken bijgehouden worden via een logger.
Foutboodschappen worden altijd via een JSON aan de front bezorgd.
Source controle
Source controle gebeurt via GitHub door regelmatig te pushen.
Staging / Deployment
De applicatie draait volledig op Docker.  
Image beschikbaar op Docker Hub / Harbor (optioneel)
Kies een gepaste Kubernetes deployment methodiek (Canary, blue-green, rolling …). (optioneel)
Testing
Unittesten / Integratie testen van de API
Testing wordt mee opgenomen in de github actions / deployment
Extra features
Extra uitbreidingsmogelijkheden, niet gezien in de les.
Versiebeheer
Response Caching en rate limiting
Memory Caching
API gateway
Voorzie een interactie met hardware
(bijvoorbeeld een ESP 32 button via MQTT / gRPC, sensoren)
Integratie met een AI service in cloud
(Azure Cognitive Services, Google Vertex AI …) / Custom AI model
Deployment naar externe host
Checklist Frontend
Design
Er is nagedacht over de functionaliteiten, je lost een probleem op.
Er is een goede UX/UI.
Er worden correcte design patterns gebruikt.
Er is ook voor goede a11y gezorgd.
Framework
Vue.js met Typescript.
Composition API (geen methods, data, etc.)
Testing
Minstens één (goede, relevante) integratie test.
Testing in deployment pipeline (speedtest, functional).
Extra: Minstens één (goede, relevante) unit test (Vitest).
Styling
Je werkt met tailwind CSS / Uno CSS.
Je voorziet ghosts, skeletons / loading states.
Je voorziet input-validatie- en foutmeldingen.
PWA
De webapp kan fullscreen launchen en heeft een correcte PWA-setup.
De PWA heeft een relevante service-worker.
Multi-language
De applicatie meertalig maken kan zeker een meerwaarde zijn. Indien je dit op een goede manier uitwerkt, kan dit zeker extra punten opleveren.
Error Logging
Het is een meerwaarde om fouten te loggen. Iets in de aard van https://sentry.io/ / LogRocket.
Development setup
Gebruik van https://codeclimate.com voor code testen en reviews is een meerwaarde.
Gebruik de npm-packages op een correcte manier. Geen onnodige npm-packages, correcte flags.
Staging / Deployment
De applicatie draait volledig op Docker.
Werken met gitflow is aangeraden.
Build optimisation
Gebruik Vite voor een betere JS-files delivery. Bv. https://www.codementor.io/drewpowers/high-performance-webpack-config-for-front-end-delivery-90sqic1qa
Bekijk hoe je bestanden beter kan minifieën.
Bekijk hoe je alles sneller kan leveren, denk aan de FCP, FMP, etc.
Eigen inbreng
Werk iets kleins uit, dat niet uitgewerkt werd in de cursus, waar je via zelfstudie extra punten mee wil verdienen.
Transities tussen schermen.
Gebruik van Nuxt indien relevant voor SEO!
Uitwerking van onderdeel met Web Assembly.
Webworker die zware taken van de main thread halen.
Shared workers voor synchrone werking over meerdere tabs (indien relevant).
Gebruik van Bun.
Model Context Protocol MCP server integratie voor LLM.

README.md
Je bent klaar met het eindproject?
Controleer dan de Readme.md van je repository.
Is het – voor een persoon die niet vertrouwd is met je project – mogelijk om het project (lokaal) “up and running” te krijgen?

Zorg dat zeker beschreven staat:
Of er een env-file nodig is. Voorzie een .env.example met dummy data. Zodat de gebruiker deze snel kan invullen.
Gebruik je een externe dienst, die een secret voorziet? Bv firebase.
Zijn er extra instellingen bij deze dienst die we nog moeten doen, als er met een nieuw account wordt gewerkt?
Waar moet dit bestand geplaatst worden in het project?
Zijn er commando’s die moeten uitgevoerd worden?
Welke commando’s moeten er uitgevoerd worden om de database te seeden? (In welke volgorde)

Dit stappenplan moet eenvoudig uitgeschreven zijn. Als de repo wordt gekloond en het stappenplan wordt gevolgd, dan is er een werkend project. (test dit zeker ook eens uit)

README.md file (project dossier)
Het projectdossier plaats je voor het eerst op GitHub tegen 1 oktober en wordt jouw centraal werkdocument. Dit dossier moet je continu up-to-date houden om de evolutie van het project te volgen. Het dossier is kort en overzichtelijk (bv.: 1 tot 2 pagina’s).
Inhoud:
Praktische elementen:
Paswoorden om te testen
Geplande werkverdeling per persoon in jouw team (wie werkt welke flows en schermen uit? Beschrijf de schermen kort).
Geplande milestones (Noot: de milestones zijn kritische targets, die je wenst te behalen. Een niet behaalde milestone resulteert in herplanning en aanpassing van het dossier).
Rapportering: (Bij het finaal indienen):
Indienen van beide checklisten (frontend/backend) met extra uitleg waar nodig.
Opsommen van werktijd: de geschatte werktijden uit de eerste milestone planning plaats je tegenover de werkelijk behaalde planning EN werkelijk gepresteerde uren (projectboard) TOGGLE.
Grootste behaalde succes,
Grootste moeilijkheid (al dan niet opgelost, of omzeild),
Eventueel: beschrijving van de door jou aangemaakte extra’s in het project, algemene opmerkingen of suggesties.
Presentatie
Wat willen we niet zien:
GEEN powerpoint presentatie! Toon enkel het eindresultaat in de browser.
Toon nuttige zaken: We willen niet zien hoe je een eenvoudig account aanmaakt, of hoe je een paswoord reset…
Birds clone!

Wat willen we wel zien:
Start op met Docker en seed de (lege) database. Vertel dan de flows.
Wat kan je PWA specifiek die de probleemstelling voor de opdracht oplost?
Wat zal anders zijn dan bij de andere groepjes?
Welke “edge cases” heb je uitgewerkt? Bespreek dit
Kies: Demonstreer 1 flow van je applicatie of verkies je om deel per deel uit te leggen?
Is er een onderdeel waar je heel sterk inzette op foutcontrole? Toon dit dan.
Is er een onderdeel in de backend waar de resolvers/service veel meer zijn dan een doorgeefluik met de database? Dus waar je veel tijd spendeerde aan logica. Bespreek dit dan zeker.
Leg uit hoe je realtime hebt uitgewerkt in de PWA en backend.
Bespreek 1 specifieke test voor de backend waar je fier over bent?
Bespreek 1 specifiek test voor de frontend waar fier over bent?
Zijn er zaken die niet gelukt zijn in de frontend maar wel in de backend, demonstreer dit dan via de playground van Apollo.
Je mag in de code duiken tijdens de presentatie. Maar leg “concepten” uit en niet lijn per lijn…

Project information:
"Vaccinatie-levering"
Digitaal platform voor vaccin-bestelling en routebeheer op basis van aptohekerwensen

Algemene regels en businesslogica:
Besteliing geplaatst voor de sluitingstijd = levering die dag
Bestelling na sluitingstijd = levering volgende dag
Geen retroactieve bestellingen mogelijk
3 gebruikersrollen - apotheker, admin, bezorger
Elke rol heeft toegang tot enkel eigen schermen en gegevens

Apotheker:
Bestelling plaatsen:
3 vaccintypes beschikbaar
Maximum 50 dosissen per dag per soort
Maximum 200 dosissen per weerk (alle soorten samen)
Bestelling geld voor levering die dag
Limietcontrole bij indienen - overschrijding wordt geblokkeerd met melding
Bestelgeschiedenis:
Overzicht van vorige bestellingen
Status per bestelling (in behandeling, geleverd)
Weekverbruik per vaccin zichtbaar
Meldingen:
Bevestiging bij geplaatste bestelling
Melding bij verwachte levertijd
Waarschuwing bij naderende weeklimiet

Admin - Backoffice:
Routebeheer:
Routes opstellen en toewijzen per bezorger
Routetemplate aanmaken met vaste stops per dag
Template koppelen aan een bezorger
Dagplanning automatisch genereren vanuit template
Apothekers zonder bestelling worden automatisch overgeslagen (niet omrijden)
Stockbeheer:
Huidige voorraad per vaccin bekijken
Vaccins bijkopen of toevoegen aan stock
Stockwaarschuwing bij lage voorraad
Overzicht en rapportage:
Dagelijks overzicht van bestelling per apotheker
Leveringsstatus opvolgen
Weekstatistieken per vaccin

Bezorger - Mobiele app:
Route van de dag:
Eigen route voor de huidige dag
Stops enkel voor apothekers met een actieve bestelling
Per stop: adres + te leveren vaccins en hoeveelheden
Route van Morgen:
Vooruitblik op de volgende dag
Gebaseerd op bestellingen ingediend voor de sluitingstijd
Toegang en privacy:
Ziet enkel eigen toegewezen routes
Gekoppeld aan eigen account/chauffeursprofiel
Geen toegang tot routes van andere bezorgers

Evaluation rubric:
Full Stack onderdeel
0-8 9-13 14+
Er zijn te weinig flows gemaakt,
of de flows die er zijn zijn te
weinig uitgewerkt om een
oplossing te bieden voor de
opdrachtomschrijving. Er is te
weinig gedacht aan de UX van de
eindgebruiker. Het project is zeker
niet inzetbaar in het bedrijfsleven
De uitgewerkte "flows" dekken
de opdrachtomschrijving af.
Wat je maakte is technisch
correct. Maar er is te weinig
aandacht aan de UX voor de
eindgebruiker. De opdracht gaat
niet verder dan een "proof of
concept". De oplossing is niet
bruikbaar in het dagelijks
(bedrijsf)leven doordat het geen
goede oplossing biedt voor de
eindgebruiker.
De flows lossen echte problemen op. Ze zijn
bruikbaar in een real life omgeving. Er is
voldoende aandacht geweest aan de UX van
de verschillende schermen. De applicatie
helpt de eindgebruiker bij het dagelijks werk
Het project is goed gedocumenteerd
0 3 5
Een andere developer kan het
project niet runnen op de eigen
laptop, door enkel de
documentatie te volgen. Maar zal
zelf op zoek moeten gaan naar de
juiste env files, waar er
credentials moeten toegevoegd
worden, welke scripts er
bestaan,…
De documentatie is ruim, maar
niet volledig
De documenatie in de readme.md is duidelijk
voor een andere developer. Deze weet
perfect wat die moet doen om het project te
laten runnen als de documentatie gevolgd
wordt. (env files, credentials, scripts,…)
Seeding voorzien
0 2 5
Ontbreekt. Of het uitvoeren van
de seeding geeft fouten.
Er is seed data aanwezig, maar
door meer of andere data te
kiezen kon je beter de
meerwaarde van het project
aantonen. Of er ontbreekt data
voor bepaalde entiteiten
Projet wordt perfect geseed met nuttige
data, zodat het project direct te demo-en is
én bepaalde uitzonderingen aangetoond
kunnen worden
Er is een realtime component aanwezig binnen het project
0 4-7 7+
Ontbreekt, of werkt niet correct Er is een werkend realtime (
maar is eenvoudig) aanwezig.
Door het ontbreken van
businneslogica is het niet echt
een meerwaarde, maar eerder
een "schoolse" implementatie
De realtime is UX gewijs een meerwaarde
aan het project. Er is voldoende business
logica. Bv de berichten worden verstuurd
naar een bepaalde groep binnen de
applicatie
Gebruik van Docker
0 1 5
Geen gebruik van Docker voor jouw projectEnkel de database werkte in
Docker. Maar het project start
op vanuit VS Code
Tijdens de presentatie kan je aantonen dat
zowel de front-, backend en database build
naar Docker containers. Zodat het project
kan gerund worden zonder VS Code
Backend onderdeel
Entities en validation - Database
0-5 5-6 7+
Jullie opdracht lost verschillende "flows" (of enkele heel gedetaileerde "flows") op van de
probleemstelling
De entities zijn te beperkt, te
weinig properties. Er ontbreekt
validatie (of de validatie is niet
correct gekozen) op bepaalde
entities. Dit is eerder een proof of
concept dan dat het backend
project een (onderdeel) is van een
professioneel project
Er zit correcte validatie op de
entities. De correcte entities
(met de goed gekozen
properties) zijn aanwezig om de
opdrachtomschrijving uit te
werken
Je werkte meer dan voldoende entities uit. Je
maakte steeds de juiste keuze om met
embedded documents te werken, of te linken
naar een entitie. Deze backend kan deel
uitmaken van een professioneel project. Het
project gaat verder dan een schools demo
project
Service en resolvers
0-10 10-12 14+
Je bouwde enkel doorgeefluiken
van data. Je code bevat te weinig
logica om een professioneel
project te zijn
Er is voldoende logica
geschreven in de resolvers en
services. Je code gaat verder
dan een zuiver "letterlijk"
doorgeefluik van de documents
uit de databank
Je services zijn een meerwaarde voor de
probleemstelling.Je gaat verschillende
uitzonderingen gaan opvangen in je code. Er
zit een hele businesslogica achter je
(bepaalde) services. Er zijn voldoende
Queries en Mutations gemaakt, zodat dit een
volwaardige GraphQL API is.
Testing
0-5 5-6 7+
Testing ontbreekt, is te beperkt
of je test steeds hetzelfde
concept tijdens de testing.
Je hebt een beperkt gedeelte
getest, je bewijst met je tests
dat je begrijpt hoe de
verschillende concepten van de
testing code werkt. Maar er
waren veel meer (nuttige) zaken
te testen binnen jouw deel van
het project
Je werkte een volledige unit én e2e testing
uit. Je gaat verschillende nuttige zaken gaan
testen. Als je deze tests runt, ben je zeker
dat dit deel van de code goed werkt om je
verschillende inputs met verschillende
outputs gaat testen. Je koos om een deel
met veel businesslogica te gaan testen.
Hierdoor maakte je complexe tests aan.
Authenticatie / Authorization
0-5 5-6 7+
Er is geen authentication en/of
authorization voorzien.
Er zijn onderdelen van de api
beschermd met authentication
én authorization. Maar bepaalde
queries of mutation zijn
onbeschermd waardoor deze
een beveiligingsrisico zijn.
Er is doordacht gebruik gemaakt van
authenticatie en authorization. Dit wil
zeggen dat voor elke query en/of mutation
kan aangetoond worden waarom deze
publiek is - of beschermd is - door
authentication/authorization.
Frontend
Framework
0-5 6-13 14+
Het gebruik van het framework is
ondermaats. Er wordt gebruik
gemaakt van
document.querySelector, er
worden geen composables
gebruikt, code is niet logisch
gestructureerd.
De code wordt onderverdeeld in
components. Er zijn een aantal
composables die gebruikt
worden. Er is nog verbetering
mogelijk door extra
opsplitsingen, meer gebruik van
composables. Sommige namen
zijn niet volgens de conventies.
Er wordt op een professionele manier met
Vue gewerkt. Patterns worden goed
toegepast, er wordt op een goede manier
reactive gewerkt. Code is efficient en
gestructureerd, heeft goede naamgeving en
volgt de standaarden.
Testing
0-5 5-6 7+
Testing ontbreekt, is te beperkt
of je test steeds hetzelfde
concept van de testing.
Je hebt een beperkt gedeelte
getest, je bewijst met je tests
dat je begrijpt hoe de
verschillende concepten van de
testing code werken. Maar er
waren veel meer (nuttige) zaken
te testen binnen jouw deel van
het project
Je werkte een volledige unit en e2e testing
uit. Je gaat verschillende nuttige zaken
testen. Als je deze tests runt, ben je zeker
dat dit deel van de code goed werkt voor
eindgebruikers.
Multilanguage
0-2 2-3 3-5
Er is geen mogelijkheid om
content te vertalen.
Er is een aanzet om de website
te vertalen. Delen kunnen
vertaald worden, je toont dat je
vertalingen kan implementeren.
Je vertaalt grote delen van de website, zowel
HTML-content als attributen en pseudo-
elementen. Je houdt rekening met de
localisatie van datums en getallen.
a11y (Accessibility)
0-2 2-4 5
Er is geen rekening gehouden met
accessibility.
Er wordt gedacht aan
screenreaders (hide accessible)
en er is voldoende contrast. Er is
een mogelijkheid om op een
duidelijke manier door de
website te navigeren met het
keyboard.
Er kan eenvoudig gebruik gemaakt worden
van het keyboard om te navigeren. Een user
instelling van "reduced-motion" wordt
gerespecteerd en gehoor aan gegeven, er zijn
aria-labels en er is een ingevulde a11y
checklist.
Verlies in punten
Dit onderdeel is gewoon een kopie van het labo?!
Het is niet mogelijk om een werkend project in docker te runnen.
Code is niet professioneel / Structuur van monorepo voldoet niet
Je oplossing is niet bruikbaar in een professionele omgeving.
Je kan geen uitleg geven bij code onderdelen - die bv zijn gegenereerd door AI.
Visueel oogt je project niet professioneel
Het is geen PWA
Niet voldaan aan de technische vereisten van de opdracht
Slechte styling, niet responsive, etc.
Bonus punten
Gebruik van nieuwe extra technologie die niet in de les is gezien
Het project staat online gehost
De testing is mee opgenomen in een CI/CD GitHub Pipeline
Build optimisation
Logging van errors
Dark mode
Monorepo aanpak
Extra PWA aspecten geïmplementeerd (API's, notifications, etc.)
Er worden view-transitions gebruikt
