# Portfolio WebXR – galerie des métiers du bâtiment

Une galerie d'art en 3D, visitable à l'écran (ordinateur, tablette, téléphone) ou au casque de réalité virtuelle (Meta Quest, etc.).

## Contenu du dossier

```
index.html          page et interface
js/main.js          galerie 3D, visite guidée, mode VR
data/contenu.json   tous les textes (à modifier pour chaque élève)
assets/             1.png à 6.png et 1.mp4 (à ajouter)
```

## Ajouter les médias

Déposez dans `assets/` les six images `1.png` … `6.png` et la vidéo `1.mp4`.
Si un fichier manque, la galerie affiche un cadre « introuvable » à sa place, sans planter.

Conseils pour que ça reste fluide au casque :

- images : 2048 px maximum sur le grand côté (la galerie réduit les plus grandes automatiquement) ;
- vidéo : MP4 en H.264, 1080p maximum, quelques dizaines de Mo au plus.

## Modifier les textes

Tout se passe dans `data/contenu.json` :

- `eleve` : nom, métier visé, phrase d'accroche (affichés sur le mur d'accueil) ;
- `presentation`, `qualites`, `competences`, `formation`, `contact` : un `titre`, éventuellement un `texte`, et une liste d'`items` (`titre` + `detail`) ;
- `oeuvres` : pour chacune des six images, le nom du fichier, un `titre` et une `legende` (cartel à côté du cadre) ;
- `video` : fichier, titre et légende.

Les panneaux ajustent la taille du texte pour tout faire tenir. Au-delà d'une dizaine de lignes par panneau, la lecture devient difficile : mieux vaut rester concis.

## Lancer le portfolio

Les navigateurs refusent de lire le fichier JSON si on ouvre `index.html` directement. Il faut un petit serveur :

```
cd portfolio-webxr
python3 -m http.server 8000
```

Puis ouvrez http://localhost:8000.

## Utiliser la réalité virtuelle

Le mode VR demande une adresse en **HTTPS**. Pour l'essayer sur un casque :

1. mettez le dossier en ligne (GitHub Pages, Netlify, ou l'hébergement de l'établissement) ;
2. ouvrez l'adresse dans le navigateur du casque ;
3. appuyez sur « Entrer en VR ».

En VR, pointez une manette vers le sol et appuyez sur la gâchette pour vous téléporter. Pointez une œuvre ou un panneau pour vous placer devant.

## Commandes à l'écran

- faire glisser : regarder autour ;
- boutons Précédent / Suivant, flèches du clavier : avancer d'une station ;
- clic sur une œuvre, un panneau ou une entrée du sommaire : s'y rendre ;
- clic sur la vidéo quand on est devant : pause / lecture ;
- bouton « Version texte » : tout le contenu en texte simple, pour la lecture et l'accessibilité.

## Le décor

Murs en béton banché (avec ses joints et trous de banche), parquet en chêne, rails de projecteurs. Un trait de niveau bleu, comme celui qu'on trace sur un chantier, fait le tour de la salle.
Les couleurs sont regroupées en haut de `js/main.js` (objet `C`) et dans les variables CSS de `index.html`.
