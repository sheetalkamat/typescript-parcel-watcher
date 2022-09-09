# typescript-parcel-watcher
Prototype file and directory watcher for typescript with @parcel/watcher

## Installing

```bash
git clone https://github.com/sheetalkamat/typescript-parcel-watcher.git
cd typescript-parcel-watcher
npm i
npm run build
```

## Usage

```bash
npm link
cd repoWithTypeScriptCode
npm link typescript-parcel-watcher
```

At this point you can pass `--watchFactory typescript-parcel-watcher` to tsc or set it in `watchOptions` of config file and/or vscode settings.
