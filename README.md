# Jimmy Neutron: Retroville Unleashed

An open-world 3D sandbox game set in Retroville. You play as Jimmy Neutron with Goddard at your side, a full underground lab, eight inventions, three vehicles, and a town full of missions and enemies.

Everything is rendered with [Three.js](https://threejs.org) using cel-shaded, outlined models built in code, styled after the show: big-headed kids (Jimmy's soft-serve hair swirl, Carl's glasses, Sheen's spikes), a robot-dog Goddard with flap ears, egg-shaped Yokians, fuzzy Twonkies and retro-futurist Retroville buildings. These are fan-made stand-ins, not the show's actual assets.

## Download and play

Desktop versions for **Linux** and **macOS** are built automatically and posted on the [Releases page](https://github.com/NyteRyzer/j.i.n-game/releases). The newest build is always under **latest-build**.

| Your computer | Download | How to start it |
| --- | --- | --- |
| Linux (any distro) | `...-linux-x86_64.AppImage` | Make it executable (`chmod +x Retroville-*.AppImage`, or right-click → Properties → Allow executing), then double-click it. |
| Ubuntu / Debian | `...-linux-amd64.deb` | `sudo apt install ./Retroville-Unleashed-*-linux-amd64.deb`, then launch **Retroville Unleashed** from your apps. |
| Linux (no install) | `...-linux-x64.tar.gz` | Extract it and run `retroville-unleashed` inside the folder. |
| Mac with Apple Silicon (M1 or newer) | `...-mac-arm64.dmg` | Open the .dmg and drag the app to Applications. |
| Mac with an Intel chip | `...-mac-x64.dmg` | Same as above. |

**First launch on a Mac:** the app isn't notarized by Apple, so macOS blocks a plain double-click. Right-click (or Control-click) the app in Applications and choose **Open**, then **Open** again. If macOS still says the app is damaged or can't be opened, run this once in Terminal:

```sh
xattr -cr "/Applications/Retroville Unleashed.app"
```

The desktop app is fully offline, keeps its own save file, supports fullscreen (`F11`) and works with game controllers.

### Play in a browser instead

Open `index.html` in any modern desktop browser with WebGL. There's no build step and nothing to install. Three.js and the fonts are bundled in `vendor/`, so it also works offline straight from disk (`file://`).

### Build the desktop apps yourself

Needs [Node.js](https://nodejs.org) 20 or newer.

```sh
npm install
npm start            # run the desktop app from source
npm run dist:linux   # AppImage, .deb and .tar.gz in dist/
npm run dist:mac     # .dmg and .zip in dist/ (run this on a Mac)
```

Play with keyboard and mouse, or a controller (Xbox, PlayStation or Switch Pro). The full controller layout is in the pause menu.

| Key | Action |
| --- | --- |
| `W A S D` / arrows | Move, or drive a vehicle |
| Mouse | Look around and aim (click the game once to capture the mouse; `Esc` frees it) |
| `C` | Switch between the third-person camera (default) and the overhead view |
| `Z` | Zoom the overhead camera |
| Click / `Space` | Use the selected invention, or fire the vehicle weapon |
| `1`–`8` / mouse wheel | Choose an invention |
| `Shift` | Sprint, or vehicle boost |
| `E` | Talk, enter doors, use lab stations, get in or out of vehicles |
| `G` | Goddard mode: follow → attack → stay |
| `V` | Ride the Goddard Bike |
| `Q` | Mission log |
| `M` | Full town map |
| `F11` | Fullscreen |
| `F3` | Frame-rate counter |
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

**Missions** (11): story missions from VOX, plus side missions from Sheen, Carl, Hugh, Libby, Cindy and Ms. Fowl. They include llama round-ups, a duck hunt, a timed race, and boss fights. A yellow `!` over someone's head means they need help.

**Emergency alerts**: once the tutorial is done, VOX always has a repeatable alert: a random enemy outbreak somewhere in town, for neutronium.

**Golden Atoms**: 28 hidden around Retroville. Some sit on rooftops or over water, so you'll need the jetpack, hovercar or rocket. Each is worth 25 neutronium, with a 500 bonus for finding them all. Nearby atoms flash on the minimap.

**Music**: a procedural soundtrack that changes with what's happening: sunny daytime, night, combat, boss fights and the lab.

**Settings**: camera (third-person or overhead), music and sound volume, mouse and stick sensitivity, graphics quality (High, Medium, Low), difficulty (Easy, Normal, Hard), invert look and a frame-rate counter.

**Saving**: the game autosaves every 30 seconds and when you quit: neutronium, upgrades, missions, Golden Atoms, where you are, the time of day and your current story mission.

## Code layout

| File | Contents |
| --- | --- |
| `js/util.js` | Math helpers, seeded RNG, save storage |
| `js/audio.js` | Synthesized sound effects and the procedural music |
| `js/world.js` | Tiles, Retroville map layout, the lab, ground texture and minimap drawing |
| `js/entities.js` | Jimmy, Goddard, clones, NPCs, enemies and bosses, vehicles, projectiles, pickups, effects |
| `js/inventions.js` | The eight inventions |
| `js/missions.js` | Townsfolk and the mission system |
| `js/models.js` | Procedural 3D models: characters, Goddard, enemies, vehicles, items, buildings, lab stations |
| `js/render3d.js` | Three.js scene, world building, entity syncing, cameras, day/night lighting, on-screen labels |
| `js/collectibles.js` | Golden Atoms |
| `js/ui.js` | HUD, minimap and menus (including settings) |
| `js/settings.js` | Player settings and controller input |
| `js/main.js` | Game state, input, interaction, encounters, main loop |
| `vendor/three.min.js` | Three.js r128 (MIT license, see `vendor/THREE-LICENSE`) |
| `vendor/fonts/` | Bungee and Fredoka (SIL Open Font License) |
| `desktop/` | Electron shell for the Linux and macOS apps |
| `build/` | App icon and the macOS signing step |
| `.github/workflows/build-desktop.yml` | Builds the desktop apps and publishes them as a Release |
