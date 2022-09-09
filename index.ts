import * as ts from "typescript";
import * as watcher from "@parcel/watcher";
import * as paths from "path";
enum WatchType {
    File,
    Directory,
}
interface FileWatch {
    type: WatchType.File,
    path: string;
    callback: ts.FileWatcherCallback;
}
interface DirectoryWatch {
    type: WatchType.Directory,
    path: string;
    recursive: boolean | undefined;
    callback: ts.DirectoryWatcherCallback;
}
interface Subscription  {
    dir: string;
    promise: Promise<watcher.AsyncSubscription>;
    watches?: Set<FileWatch | DirectoryWatch>;
}
const subscriptions = new Map<string, Subscription>();
function watchDirectory(typescript: typeof ts, path: string, callback: ts.DirectoryWatcherCallback, recursive?: boolean): ts.FileWatcher {
    console.log(`typescript-parcel-watcher:: watchDirectory:: path: ${path} ${recursive}`);
    return getFileWatcherFromCallback(
        getSubscriptionForDirectory(typescript, path),
        { type: WatchType.Directory, path, recursive, callback }
    );
}
function watchFile(typescript: typeof ts, path: string, callback: ts.FileWatcherCallback) {
    console.log(`typescript-parcel-watcher:: watchFile:: path: ${path}`);
    return getFileWatcherFromCallback(
        getSubscriptionForDirectory(typescript, paths.dirname(path)),
        { type: WatchType.File, path, callback }
    );
}
function getFileWatcherFromCallback(subscription: Subscription, watch: FileWatch | DirectoryWatch): ts.FileWatcher {
    const dir = subscription.dir;
    (subscription.watches ??= new Set()).add(watch);
    return {
        close: () => {
            const existing = subscriptions.get(dir);
            if (!existing?.watches?.delete(watch)) return;
            if (existing.watches.size) return;
            subscriptions.delete(dir);
            console.log(`typescript-parcel-watcher:: Closing ${dir}`);
            existing.promise.then(s => s.unsubscribe());
        }
    }
}
function getSubscriptionForDirectory(typescript: typeof ts, path: string) {
    return subscriptions.has(path) ?
        getOrCreateSubscription(typescript, path)! :
        forEachAncestor(path, dir => typescript.sys.fileExists(dir + "/package.json") ? getOrCreateSubscription(typescript, dir) : undefined) ||
        forEachAncestor(path, dir => typescript.sys.directoryExists(dir) ? getOrCreateSubscription(typescript, dir) : undefined)!;
}
function forEachAncestor<T>(path: string, callback: (dir: string) => T | undefined): T | undefined {
    while (true) {
        const result = callback(path);
        if (result) return result;
        const parent = paths.dirname(path);
        if (parent === path) return undefined;
        path = parent;
    }
}
function getOrCreateSubscription(typescript: typeof ts, path: string) {
    let result = subscriptions.get(path);
    if (!result) subscriptions.set(path, result = { dir: path, promise: subscribe(typescript, path) });
    return result;
}
async function subscribe(typescript: typeof ts, path: string) {
    console.log(`typescript-parcel-watcher:: Subscribing to ${path}`);
    return await watcher.subscribe(path, (err, events) => {
        const existing = subscriptions.get(path);
        if (!existing?.watches?.size) return;
        console.log(`typescript-parcel-watcher:: ${path}:: Err: ${err} Events:: ${JSON.stringify(events, undefined, 2)}`);
        events.forEach(event => {
            const eventPath = normalizeSlashes(event.path);
            existing.watches?.forEach(watch => {
                if (watch.type === WatchType.File) {
                    if (isSamePath(typescript, eventPath, watch.path)) {
                        const eventType = event.type === "create" ?
                            typescript.FileWatcherEventKind.Created :
                            event.type === "delete" ?
                                typescript.FileWatcherEventKind.Deleted :
                                typescript.FileWatcherEventKind.Changed;
                        console.log(`typescript-parcel-watcher:: watchFile:: Invoke:: ${watch.path}:: Event: ${eventType}`);
                        watch.callback(watch.path, eventType);
                    }
                }
                else if (watch.recursive ? containsPath(typescript, watch.path, eventPath) : isSamePath(typescript, paths.dirname(eventPath), watch.path)) {
                    console.log(`typescript-parcel-watcher:: watchDirectory:: Invoke:: ${watch.path}:: ${watch.recursive} File: ${eventPath}`);
                    watch.callback(eventPath);
                }
            });
        });
    });
}
const directorySeparator = "/";
const backslashRegExp = /\\/g;
function normalizeSlashes(path: string): string {
    return path.indexOf("\\") !== -1
        ? path.replace(backslashRegExp, directorySeparator)
        : path;
}
const fileNameLowerCaseRegExp = /[^\u0130\u0131\u00DFa-z0-9\\/:\-_\. ]+/g;
function toFileNameLowerCase(x: string) {
    return fileNameLowerCaseRegExp.test(x) ?
        x.replace(fileNameLowerCaseRegExp, toLowerCase) :
        x;
}
function toLowerCase(x: string) {
    return x.toLowerCase();
}
function canonicalPath(typescript: typeof ts, path: string) {
    return typescript.sys.useCaseSensitiveFileNames ? path : toFileNameLowerCase(path);
}
function containsPath(typescript: typeof ts, parent: string, child: string) {
    if (isSamePath(typescript, parent, child)) return true;
    if (child.length <= parent.length) return false;
    if (child[parent.length] !== directorySeparator) return false;
    return child.startsWith(parent) || canonicalPath(typescript, child).startsWith(canonicalPath(typescript, parent));
}
function isSamePath(typescript: typeof ts, path1: string, path2: string) {
    return path1 === path2 || path2.length === path2.length && canonicalPath(typescript, path1) === canonicalPath(typescript, path2);
}
function factory({ typescript }: { typescript: typeof ts }) {
    return {
        watchDirectory: (path: string, callback: ts.DirectoryWatcherCallback, recursive?: boolean) =>
            watchDirectory(typescript, path, callback, recursive),
        watchFile: (path: string, callback: ts.FileWatcherCallback) =>
            watchFile(typescript, path, callback),
    };
}
export = factory;