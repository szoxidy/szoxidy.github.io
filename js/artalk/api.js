// Artalk transport helpers and scoped editor/plugin bridges.

// EditorPluginManager.getOptions().getApi is the public API provider consumed
// by the native Submit and StateReply plugs. Return an adapter for that editor
// only: never patch the library, the global API, XMLHttpRequest or fetch.
export function bridgeArtalkEditorApi(manager, getFields, onFailure, signal) {
    const options = manager.getOptions();
    const original = options.getApi;
    options.getApi = () => {
        const native = original();
        const api = Object.create(native);
        api.comments = { ...native.comments };
        const request = async action => {
            signal?.throwIfAborted();
            const response = await action();
            // A retired editor must not insert into a new PJAX page, even when
            // a completed response races with cancellation.
            signal?.throwIfAborted();
            return response;
        };
        api.comments.createComment = async (data, params) => {
            try {
                return await request(async () => {
                    const fields = await getFields(data);
                    signal?.throwIfAborted();
                    return native.comments.createComment({ ...data, ...fields }, { ...params, signal });
                });
            } catch (error) {
                if (!signal?.aborted) onFailure(error);
                throw error;
            }
        };
        api.comments.updateComment = async (id, data, params) => {
            try {
                return await request(() => native.comments.updateComment(id, data, { ...params, signal }));
            } catch (error) {
                if (!signal?.aborted) onFailure(error);
                throw error;
            }
        };
        api.user = {
            ...native.user,
            getUser: async (query, params) => {
                // HeaderUser supplies its own cancel token, which takes precedence
                // over RequestInit.signal in the pinned native HTTP client.
                const cancel = () => { if (params?.cancelToken) native.abortRequest(params.cancelToken); };
                signal?.addEventListener('abort', cancel, { once: true });
                try {
                    return await request(() => native.user.getUser(query, { ...params, signal }));
                } finally {
                    signal?.removeEventListener('abort', cancel);
                }
            }
        };
        return api;
    };
    // Native header lookups are debounced. Leave the abort guard on retired
    // instances so their pending timer cannot make another network request.
    return () => { if (!signal?.aborted) options.getApi = original; };
}

export function bridgeArtalkPanels(manager) {
    const original = manager.openPluginPanel;
    const open = function (active) {
        const events = manager.getEvents();
        const trigger = events.trigger;
        const hidden = manager.getPlugins().filter(plug => plug.$panel && plug !== active);
        // The pinned 2.10.1 bundle sends the selected plug in each panel-hide
        // event. Correct that payload for this call; the native manager still
        // owns opening, closing and its active plug. Fixed clients pass through.
        events.trigger = function (name, payload) {
            return trigger.call(this, name, name === 'panel-hide' && payload === active ? hidden.shift() : payload);
        };
        try { return original.call(this, active); }
        finally { events.trigger = trigger; }
    };
    manager.openPluginPanel = open;
    return () => { if (manager.openPluginPanel === open) manager.openPluginPanel = original; };
}

export async function blogArtalkJSON(server, path, query = {}, signal, options = {}) {
    const base = server.replace(/\/+$/, '').replace(/\/api(?:\/v2)?$/, '');
    const url = new URL(`${base}/api/blog/${path}`, location.href);
    Object.entries(query).forEach(([key, value]) => url.searchParams.set(key, value));
    const response = await fetch(url, {
        ...options,
        signal,
        credentials: 'omit',
        headers: { Accept: 'application/json', ...options.headers }
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.msg || data.message || `评论服务返回 ${response.status}`);
    return data;
}
