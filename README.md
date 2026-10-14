# Jimmy Neutron: Retroville Unleashed

An open-world 3D sandbox game set in Retroville. You play as Jimmy Neutron with Goddard at your side, a full underground lab, eight inventions, three vehicles, and a town full of missions and enemies.

Everything is rendered with [Three.js](https://threejs.org) using cel-shaded, outlined models built in code, styled after the show: big-headed kids (Jimmy's soft-serve hair swirl, Carl's glasses, Sheen's spikes), a robot-dog Goddard with flap ears, egg-shaped Yokians, fuzzy Twonkies and retro-futurist Retroville buildings. These are fan-made stand-ins, not the show's actual assets.

## Play

Open `index.html` in any modern desktop browser with WebGL. There's no build step and nothing to install. Three.js is vendored in `vendor/`, so it also works offline straight from disk (`file://`).

Keyboard and mouse required.

| Key | Action |
| --- | --- |
| `W A S D` / arrows | Move, or drive a vehicle |
| Mouse | Aim (overhead view) or look around (third-person view) |
| `C` | Switch between overhead and third-person camera |
| `Z` | Zoom the overhead camera |
| Click / `Space` | Use the selected invention, or fire the vehicle weapon |
| `1`–`8` / mouse wheel | Choose an invention |
| `Shift` | Sprint, or vehicle boost |
| `E` | Talk, enter doors, use lab stations, get in or out of vehicles |
| `G` | Goddard mode: follow → attack → stay |
| `V` | Ride the Goddard Bike |
| `Q` | Mission log |
| `M` | Full town map |
| `Esc` | Pause (controls, mute, reset save) |
| `N` | Mute |

## What's in it

**Retroville**: 15 districts, including Neutron Street, the Candy Bar, Lindbergh Elementary, Downtown and Town Hall, Retroland, Retroville Park, the Dump, the Warehouse District, the Yokian crash site and the river. There's a day/night cycle and townsfolk who run from danger.

**Jimmy's Lab**: take the elevator in the clubhouse.
- **VOX Mission Computer**: the mission board
- **Invention Workbench**: spend neutronium on upgrades (health, energy, damage, Goddard, magnet, vehicle armor)
- **Vehicle Bay**: summon a fresh Hovercar or Strato XL
- **Neutron Recharge Pod**: full heal
- **Invention Vault**: details on every gadget
- **Brain-Drain Helmet**: toggles God Mode for pure sandbox play
- **Training Room**: dummies to test your weapons on

**Inventions**: Neutronic Blaster, Shrink Ray (then walk over shrunk enemies to squish them), Freeze Ray, Hypno-Beam (turns enemies to your side), Burping Soda (dash plus shockwave), Clone-O-Matic, Gum Grenade, Rocket Jetpack (fly over everything).

**Vehicles**:
- Neutron Hovercar: crosses water, rams enemies, honks to stun them
- Strato XL Rocket: flies over buildings and fires twin missiles
- Goddard Bike: laser cannons

**Goddard**: follows you, shoots enemies, and has follow, attack and stay modes. He reboots if he gets knocked out.

**Enemies**: Twonkies, Yokian soldiers, Yokian saucers, Calamitous Bots and nanobot swarms. The bosses are Butch's Bully-Bot, the Calamitous Mega-Bot and King Goobot.

**Missions** (11): story missions from VOX, plus side missions from Sheen, Carl, Hugh, Libby, Cindy and Ms. Fowl. They include llama round-ups, a duck hunt, a timed race, and boss fights. A yellow `!` over someone's head means they need help. Random enemy encounters keep going after the story ends.

Progress (neutronium, upgrades, completed missions) autosaves to the browser's local storage.

## Code layout

| File | Contents |
| --- | --- |
| `js/util.js` | Math helpers, seeded RNG, save storage |
| `js/audio.js` | Synthesized WebAudio sound effects |
| `js/world.js` | Tiles, Retroville map layout, the lab, ground texture and minimap drawing |
| `js/entities.js` | Jimmy, Goddard, clones, NPCs, enemies and bosses, vehicles, projectiles, pickups, effects |
| `js/inventions.js` | The eight inventions |
| `js/missions.js` | Townsfolk and the mission system |
| `js/models.js` | Procedural 3D models: characters, Goddard, enemies, vehicles, items, buildings, lab stations |
| `js/render3d.js` | Three.js scene, world building, entity syncing, cameras, day/night lighting, on-screen labels |
| `js/ui.js` | HUD, minimap and menus |
| `js/main.js` | Game state, input, interaction, encounters, main loop |
| `vendor/three.min.js` | Three.js r128 (MIT license, see `vendor/THREE-LICENSE`) |
