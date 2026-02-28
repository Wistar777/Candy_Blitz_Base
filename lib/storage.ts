// ===== Local Storage Utility =====

export const Storage = {
    save(key: string, val: unknown) {
        try {
            const str = JSON.stringify(val);
            const obfuscated = btoa(encodeURIComponent(str));
            localStorage.setItem(key, obfuscated);
        } catch (e) {
            console.error("Storage save err:", e);
        }
    },

    load<T>(key: string, defaultVal: T): T {
        try {
            const item = localStorage.getItem(key);
            if (!item) return defaultVal;

            // Legacy plaintext migration
            if (item.startsWith('[') || item.startsWith('{') || !isNaN(Number(item)) || item === 'true' || item === 'false') {
                const val = (!item.includes('{') && !item.includes('[')) ? item : JSON.parse(item);
                this.save(key, val);
                return val as T;
            }

            const str = decodeURIComponent(atob(item));
            return JSON.parse(str) as T;
        } catch {
            return defaultVal;
        }
    },

    remove(key: string) {
        localStorage.removeItem(key);
    },
};
