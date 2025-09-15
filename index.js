// SillyTavern-state 扩展脚本
(function() {
    const context = SillyTavern.getContext();
    const { eventSource, event_types, chatMetadata, saveMetadata } = context;

    // 扩展在 chatMetadata 中使用的键名:contentReference[oaicite:0]{index=0}
    const META_KEY = 'sillyTavernState';

    // 处理扩展热重载：清理已有的事件监听和 DOM 元素
    if (globalThis.stateExt?.initialized) {
        if (globalThis.stateExt.msgHandler) {
            eventSource.off(event_types.MESSAGE_RECEIVED, globalThis.stateExt.msgHandler);
        }
        if (globalThis.stateExt.chatHandler) {
            eventSource.off(event_types.CHAT_CHANGED, globalThis.stateExt.chatHandler);
        }
        document.getElementById('stateExtPanel')?.remove();
        document.getElementById('stateExtToggleBtn')?.remove();
    }
    globalThis.stateExt = { initialized: true };

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

    // 刷新状态列表 UI 显示
    function refreshListUI() {
        const listEl = document.getElementById('stateExtList');
        listEl.innerHTML = '';  // 清空列表
        stateList = getStateList();
        stateList.forEach((item, idx) => {
            const li = document.createElement('li');
            li.innerHTML = `
                <span class="state-name">${item.name}</span:
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

    // 监听聊天切换事件：切换对话时更新状态列表显示:contentReference[oaicite:1]{index=1}
    globalThis.stateExt.chatHandler = () => {
        stateList = getStateList();
        refreshListUI();
    };
    eventSource.on(event_types.CHAT_CHANGED, globalThis.stateExt.chatHandler);

    // 监听 AI 消息接收事件：解析并应用状态更新标签
    globalThis.stateExt.msgHandler = (data) => {
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
        if (updated) {
            content = content.replace(/<[^>]+>[^<]*<\/[^>]+>/g, '').trim();
            lastMsg.mes = content;
        }
    };
    eventSource.on(event_types.MESSAGE_RECEIVED, globalThis.stateExt.msgHandler);
})();

// 提示拦截器：在生成请求前插入当前状态（系统提示）
globalThis.statePromptInterceptor = async function(chat, contextSize, abort, type) {
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
