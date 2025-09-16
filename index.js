// SillyTavern-state 扩展脚本

const STATE_EXT_SETTINGS_KEY = 'SillyTavern-state';
const STATE_EXT_DEFAULT_SETTINGS = {
    enabled: true,
    autoInjectPrompt: true,
    stripTagsFromChat: true,
    customInstruction: '',
};

function stateExtCloneDefaultSettings() {
    return JSON.parse(JSON.stringify(STATE_EXT_DEFAULT_SETTINGS));
}

function stateExtEnsureSettings() {
    const container = globalThis.extension_settings;
    if (!container) {
        return stateExtCloneDefaultSettings();
    }

    const stored = container[STATE_EXT_SETTINGS_KEY];
    if (!stored) {
        const defaults = stateExtCloneDefaultSettings();
        container[STATE_EXT_SETTINGS_KEY] = defaults;
        if (globalThis.stateExt) {
            globalThis.stateExt.settings = defaults;
        }
        if (typeof globalThis.saveSettingsDebounced === 'function') {
            globalThis.saveSettingsDebounced();
        } else if (typeof globalThis.saveSettings === 'function') {
            globalThis.saveSettings();
        }
        return defaults;
    }

    const merged = Object.assign({}, STATE_EXT_DEFAULT_SETTINGS, stored);
    container[STATE_EXT_SETTINGS_KEY] = merged;
    if (globalThis.stateExt) {
        globalThis.stateExt.settings = merged;
    }
    return merged;
}

function stateExtUpdateSettings(partial) {
    const container = globalThis.extension_settings;
    if (!container) {
        return stateExtCloneDefaultSettings();
    }

    const current = stateExtEnsureSettings();
    Object.assign(current, partial);
    container[STATE_EXT_SETTINGS_KEY] = current;

    if (globalThis.stateExt) {
        globalThis.stateExt.settings = current;
        if (typeof globalThis.stateExt.applyRuntimeSettings === 'function') {
            globalThis.stateExt.applyRuntimeSettings(current);
        }
    }

    if (typeof globalThis.saveSettingsDebounced === 'function') {
        globalThis.saveSettingsDebounced();
    } else if (typeof globalThis.saveSettings === 'function') {
        globalThis.saveSettings();
    }

    return current;
}

function stateExtResetSettings() {
    const container = globalThis.extension_settings;
    const defaults = stateExtCloneDefaultSettings();
    if (container) {
        container[STATE_EXT_SETTINGS_KEY] = defaults;
    }

    if (globalThis.stateExt) {
        globalThis.stateExt.settings = defaults;
        if (typeof globalThis.stateExt.applyRuntimeSettings === 'function') {
            globalThis.stateExt.applyRuntimeSettings(defaults);
        }
    }

    if (typeof globalThis.saveSettingsDebounced === 'function') {
        globalThis.saveSettingsDebounced();
    } else if (typeof globalThis.saveSettings === 'function') {
        globalThis.saveSettings();
    }

    return defaults;
}

(function() {
    function init() {
        const context = SillyTavern.getContext();
        const { eventSource, event_types, saveMetadata } = context;

        const META_KEY = 'sillyTavernState';

        const previousInstance = globalThis.stateExt;
        if (previousInstance?.initialized) {
            if (previousInstance.msgHandler) {
                eventSource.off(event_types.MESSAGE_RECEIVED, previousInstance.msgHandler);
            }
            if (previousInstance.chatHandler) {
                eventSource.off(event_types.CHAT_CHANGED, previousInstance.chatHandler);
            }
            if (previousInstance.settingsPanelListener) {
                eventSource.off(event_types.EXTENSION_SETTINGS_LOADED, previousInstance.settingsPanelListener);
            }
            document.getElementById('stateExtPanel')?.remove();
            document.getElementById('stateExtToggleBtn')?.remove();
            document.getElementById('stateExtSettingsRoot')?.remove();
        }

        const initialSettings = stateExtEnsureSettings();

        globalThis.stateExt = {
            initialized: true,
            settings: initialSettings,
        };

        let settingsPanelLoading = false;

        function getCurrentSettings() {
            return globalThis.stateExt?.settings || stateExtEnsureSettings();
        }

    // 获取当前聊天的状态列表（如无则初始化为空数组）
    function getStateList() {
        const meta = SillyTavern.getContext().chatMetadata;
        if (!meta[META_KEY]) {
            meta[META_KEY] = [];
        }
        return meta[META_KEY];
    }
    let stateList = getStateList();

    // 创建悬浮按钮
    const toggleBtn = document.createElement('button');
    toggleBtn.id = 'stateExtToggleBtn';
    toggleBtn.textContent = '状态栏';
    document.body.appendChild(toggleBtn);

    // 创建悬浮窗口面板
    const panel = document.createElement('div');
    panel.id = 'stateExtPanel';
    panel.innerHTML = `
        <div class="header">角色状态栏</div>
        <ul id="stateExtList"></ul>
        <textarea id="stateExtInput" rows="3" placeholder="每行输入 状态名 和 值"></textarea>
        <br/>
        <button id="stateExtAddBtn">添加</button>
        <button id="stateExtGenBtn">生成世界书条目</button>
        <button id="stateExtImpBtn">从世界书提取</button>
    `;
    document.body.appendChild(panel);

    globalThis.stateExt.toggleBtn = toggleBtn;
    globalThis.stateExt.panel = panel;

    function applyRuntimeSettings(currentSettings) {
        const config = currentSettings || getCurrentSettings();
        const isEnabled = config.enabled !== false;
        if (toggleBtn) {
            toggleBtn.style.display = isEnabled ? 'flex' : 'none';
        }
        if (panel && !isEnabled) {
            panel.style.display = 'none';
        }
        return config;
    }

    globalThis.stateExt.applyRuntimeSettings = applyRuntimeSettings;
    applyRuntimeSettings(initialSettings);

    // 刷新状态列表 UI 显示
    function refreshListUI() {
        const listEl = document.getElementById('stateExtList');
        listEl.innerHTML = '';  // 清空列表
        stateList = getStateList();
        stateList.forEach((item, idx) => {
            const li = document.createElement('li');
            li.innerHTML = `
                <span class="state-name">${item.name}</span>
                <span class="state-value">${item.value}</span>
                <input class="edit-name" type="text" style="display:none;" />
                <input class="edit-value" type="text" style="display:none;" />
                <button class="save-btn" style="display:none;">保存</button>
                <button class="cancel-btn" style="display:none;">取消</button>
                <button class="edit-btn">编辑</button>
                <button class="delete-btn">删除</button>
            `;
            // 填充隐藏输入框的初始值
            li.querySelector('.edit-name').value = item.name;
            li.querySelector('.edit-value').value = item.value;
            // 编辑按钮事件
            li.querySelector('.edit-btn').onclick = () => {
                li.querySelector('.state-name').style.display = 'none';
                li.querySelector('.state-value').style.display = 'none';
                li.querySelector('.edit-btn').style.display = 'none';
                li.querySelector('.delete-btn').style.display = 'none';
                li.querySelector('.edit-name').style.display = 'inline-block';
                li.querySelector('.edit-value').style.display = 'inline-block';
                li.querySelector('.save-btn').style.display = 'inline-block';
                li.querySelector('.cancel-btn').style.display = 'inline-block';
            };
            // 保存按钮事件
            li.querySelector('.save-btn').onclick = () => {
                const newName = li.querySelector('.edit-name').value.trim();
                const newValue = li.querySelector('.edit-value').value.trim();
                if (!newName) {
                    alert('名称不能为空！');
                    return;
                }
                // 检查重名冲突
                const conflict = stateList.find((it, i) => i !== idx && it.name === newName);
                if (conflict) {
                    alert('已有相同名称的状态项存在！');
                    return;
                }
                // 更新状态项并保存
                item.name = newName;
                item.value = newValue;
                saveMetadata();
                // 更新列表显示
                refreshListUI();
            };
            // 取消按钮事件
            li.querySelector('.cancel-btn').onclick = () => {
                // 还原编辑前的显示
                refreshListUI();
            };
            // 删除按钮事件
            li.querySelector('.delete-btn').onclick = () => {
                stateList.splice(idx, 1);
                saveMetadata();
                refreshListUI();
            };
            listEl.appendChild(li);
        });
    }
    refreshListUI();

    // 悬浮按钮：点击切换面板显隐
    toggleBtn.addEventListener('click', () => {
        if (!getCurrentSettings().enabled) {
            return;
        }
        panel.style.display = (panel.style.display === 'none' ? 'block' : 'none');
    });

    // 悬浮窗拖动功能
    let dragging = false, dragOffsetX = 0, dragOffsetY = 0;
    const headerEl = panel.querySelector('.header');
    headerEl.addEventListener('mousedown', (e) => {
        dragging = true;
        // 计算点击处与面板左上角的偏移
        dragOffsetX = e.clientX - panel.offsetLeft;
        dragOffsetY = e.clientY - panel.offsetTop;
        e.preventDefault();
    });
    document.addEventListener('mousemove', (e) => {
        if (dragging) {
            panel.style.left = (e.clientX - dragOffsetX) + 'px';
            panel.style.top = (e.clientY - dragOffsetY) + 'px';
            panel.style.bottom = 'auto';
            panel.style.right = 'auto';
        }
    });
    document.addEventListener('mouseup', () => { dragging = false; });

    // “添加”按钮：批量添加状态项
    panel.querySelector('#stateExtAddBtn').onclick = () => {
        const text = panel.querySelector('#stateExtInput').value;
        if (!text.trim()) return;
        const lines = text.split(/\r?\n/);
        let modified = false;
        for (let line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            const parts = trimmed.split(' ');
            if (parts.length < 2) continue;
            const name = parts[0];
            const value = parts.slice(1).join(' ');
            const existing = stateList.find(it => it.name === name);
            if (existing) {
                existing.value = value;
            } else {
                stateList.push({ name, value });
            }
            modified = true;
        }
        if (modified) {
            saveMetadata();
            refreshListUI();
            panel.querySelector('#stateExtInput').value = '';
        }
    };

    // “生成世界书条目”按钮：复制当前状态列表的世界书格式文本
    panel.querySelector('#stateExtGenBtn').onclick = () => {
        if (stateList.length === 0) {
            alert('当前没有任何状态项可生成。');
            return;
        }
        let content = '角色状态：\n';
        stateList.forEach(item => {
            content += `${item.name} ${item.value}\n`;
        });
        // 尝试写入剪贴板
        navigator.clipboard.writeText(content).then(() => {
            alert('世界书条目内容已复制到剪贴板！\n请在世界信息中创建新条目并粘贴内容。');
        }).catch(() => {
            // 如果剪贴板不可用，则弹出可选择文本的对话框
            prompt('请手动复制以下内容:', content);
        });
    };

    // “从世界书提取”按钮：从剪贴板内容批量导入状态项
    panel.querySelector('#stateExtImpBtn').onclick = async () => {
        try {
            const clipText = await navigator.clipboard.readText();
            if (!clipText) {
                alert('剪贴板没有内容，请先复制世界书条目文本。');
                return;
            }
            const lines = clipText.split(/\r?\n/);
            let imported = 0;
            for (let line of lines) {
                const trimmed = line.trim();
                if (!trimmed || trimmed.endsWith('：') || trimmed.endsWith(':')) {
                    // 跳过空行和类似“角色状态：”的标题行
                    continue;
                }
                const parts = trimmed.split(' ');
                if (parts.length < 2) continue;
                const name = parts[0];
                const value = parts.slice(1).join(' ');
                const existing = stateList.find(it => it.name === name);
                if (existing) {
                    existing.value = value;
                } else {
                    stateList.push({ name, value });
                }
                imported++;
            }
            if (imported > 0) {
                saveMetadata();
                refreshListUI();
                alert(`已从剪贴板导入 ${imported} 个状态项。`);
            } else {
                alert('未从剪贴板内容提取到任何状态项！');
            }
        } catch (err) {
            alert('无法读取剪贴板。请将世界书条目内容粘贴到上方文本框，然后点击“添加”。');
        }
    };

    async function initExtensionSettingsPanel(attempt = 0) {
        if (settingsPanelLoading) {
            return;
        }

        const renderTemplate = globalThis.renderExtensionTemplateAsync;
        if (typeof renderTemplate !== 'function') {
            return;
        }

        const container = document.getElementById('extensions_settings');
        if (!container) {
            if (attempt < 5) {
                setTimeout(() => initExtensionSettingsPanel(attempt + 1), 500);
            }
            return;
        }

        settingsPanelLoading = true;
        try {
            container.querySelector('#stateExtSettingsRoot')?.remove();

            const templateBases = ['third-party/SillyTavern-state', 'SillyTavern-state'];
            let templateHtml = '';
            for (const basePath of templateBases) {
                try {
                    const html = await renderTemplate(basePath, 'index');
                    if (html) {
                        templateHtml = html;
                        break;
                    }
                } catch (error) {
                    console.warn(`[角色状态栏] 无法从 ${basePath} 加载设置模板:`, error);
                }
            }

            if (!templateHtml) {
                console.warn('[角色状态栏] 未能加载扩展设置模板。');
                return;
            }

            container.insertAdjacentHTML('beforeend', templateHtml);
            const root = container.querySelector('#stateExtSettingsRoot');
            if (!root) {
                return;
            }

            const enableToggle = root.querySelector('#stateExt-setting-enable');
            const injectToggle = root.querySelector('#stateExt-setting-inject');
            const stripToggle = root.querySelector('#stateExt-setting-strip');
            const instructionTextarea = root.querySelector('#stateExt-setting-instruction');
            const restoreButton = root.querySelector('#stateExt-setting-restore');

            function syncControls(config) {
                if (enableToggle) enableToggle.checked = !!config.enabled;
                if (injectToggle) injectToggle.checked = config.autoInjectPrompt !== false;
                if (stripToggle) stripToggle.checked = config.stripTagsFromChat !== false;
                if (instructionTextarea) instructionTextarea.value = config.customInstruction || '';
            }

            syncControls(getCurrentSettings());

            if (enableToggle) {
                enableToggle.addEventListener('change', () => {
                    stateExtUpdateSettings({ enabled: enableToggle.checked });
                });
            }

            if (injectToggle) {
                injectToggle.addEventListener('change', () => {
                    stateExtUpdateSettings({ autoInjectPrompt: injectToggle.checked });
                });
            }

            if (stripToggle) {
                stripToggle.addEventListener('change', () => {
                    stateExtUpdateSettings({ stripTagsFromChat: stripToggle.checked });
                });
            }

            if (instructionTextarea) {
                let debounceTimer;
                const saveValue = () => {
                    stateExtUpdateSettings({ customInstruction: instructionTextarea.value });
                };
                instructionTextarea.addEventListener('input', () => {
                    clearTimeout(debounceTimer);
                    debounceTimer = setTimeout(saveValue, 400);
                });
                instructionTextarea.addEventListener('change', saveValue);
                instructionTextarea.addEventListener('blur', saveValue);
            }

            if (restoreButton) {
                restoreButton.addEventListener('click', () => {
                    const defaults = stateExtResetSettings();
                    syncControls(defaults);
                    window.alert('设置已恢复为默认值。');
                });
            }
        } finally {
            settingsPanelLoading = false;
            globalThis.stateExt.applyRuntimeSettings?.(getCurrentSettings());
        }
    }

    const settingsPanelListener = () => initExtensionSettingsPanel();
    globalThis.stateExt.settingsPanelListener = settingsPanelListener;
    eventSource.on(event_types.EXTENSION_SETTINGS_LOADED, settingsPanelListener);
    initExtensionSettingsPanel();

    // 监听聊天切换事件：切换对话时更新状态列表显示
    globalThis.stateExt.chatHandler = () => {
        stateList = getStateList();
        refreshListUI();
    };
    eventSource.on(event_types.CHAT_CHANGED, globalThis.stateExt.chatHandler);

    // 监听 AI 消息接收事件：解析并应用状态更新标签
    globalThis.stateExt.msgHandler = () => {
        const settings = getCurrentSettings();
        if (!settings.enabled) {
            return;
        }
        const chatArr = SillyTavern.getContext().chat;
        if (!chatArr.length) return;
        const lastMsg = chatArr[chatArr.length - 1];
        if (lastMsg.is_user) return;  // 确保是 AI 消息
        let content = lastMsg.mes;
        const tagRegex = /<([^\/>]+)>([^<]+)<\/\1>/g;
        let match, updated = false;
        while ((match = tagRegex.exec(content)) !== null) {
            const [fullMatch, name, newValue] = match;
            const item = stateList.find(it => it.name === name);
            if (item) {
                item.value = newValue;
            } else {
                stateList.push({ name, value: newValue });
            }
            updated = true;
        }
        if (updated) {
            saveMetadata();
            refreshListUI();
        }
        // 移除消息中的所有状态标签，留下纯剧情文本
        if (updated && settings.stripTagsFromChat !== false) {
            content = content.replace(/<[^>]+>[^<]*<\/[^>]+>/g, '').trim();
            lastMsg.mes = content;
        }
    };
    eventSource.on(event_types.MESSAGE_RECEIVED, globalThis.stateExt.msgHandler);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();

// 提示拦截器：在生成请求前插入当前状态（系统提示）
globalThis.statePromptInterceptor = async function(chat, contextSize, abort, type) {
    const settings = stateExtEnsureSettings();
    if (!settings.enabled || !settings.autoInjectPrompt) {
        return;
    }
    // 移除旧的状态系统提示，避免堆积
    for (let i = 0; i < chat.length; i++) {
        const msg = chat[i];
        if (!msg.is_user && msg.name === 'System Note' && msg.mes && msg.mes.startsWith('当前状态')) {
            chat.splice(i, 1);
            i--;
        }
    }
    // 获取状态列表并构造提示文本
    const meta = SillyTavern.getContext().chatMetadata;
    const stateData = meta['sillyTavernState'];
    if (stateData && stateData.length > 0) {
        let stateText = '当前状态：';
        stateData.forEach(item => {
            stateText += `\n${item.name} ${item.value}`;
        });
        stateText += '\n请参考以上状态。在回答时，如有任何状态数值因剧情发生变化，请仅输出发生变化的状态项，并使用 XML 标签格式表示，例如：<生命值>8/10</生命值>。如果没有状态变化，请不要输出任何状态标签。';
        const extraInstruction = (settings.customInstruction || '').trim();
        if (extraInstruction) {
            stateText += `\n${extraInstruction}`;
        }
        const systemNote = {
            is_user: false,
            name: 'System Note',
            send_date: Date.now(),
            mes: stateText
        };
        // 插入系统提示到最后一个用户消息之前
        chat.splice(chat.length - 1, 0, systemNote);
    }
};
