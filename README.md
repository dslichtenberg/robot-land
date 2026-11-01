# Robot Land to Gecko Land

A browser game for a 7 year old. Drive a little car through Robot Land, solve the puzzles in six haunted houses, and get home to Gecko Land. Open `index.html` in a browser to play. No install and no internet needed.

Keyboard: arrow keys or WASD to drive, `P` for the phone, `M` for sound, number keys to answer puzzles. On an iPad, use the arrow buttons in the corner.

## Files

| File | What it holds |
|---|---|
| `index.html` | The page, the buttons and boxes on top of the game |
| `style.css` | How the buttons and boxes look |
| `characters.js` | The six friends, their perks, and drawing code for every creature |
| `map.js` | The world map (edit the letters to change it), robot hints, road villains, tile drawing |
| `puzzles.js` | The six puzzles and the haunted house room |
| `game.js` | The game loop, screens, driving, houses, saving and sound |

Type `state` in the browser console to see everything the game knows.

## Putting it on S3

1. In the S3 console, open the bucket, go to Properties, turn on Static website hosting, and set the index document to `index.html`.
2. Under Permissions, turn off "Block all public access" and add a bucket policy that allows `s3:GetObject` for everyone, then run `./deploy.sh your-bucket-name`.
