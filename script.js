// ─── Default background on first install ─────────────────────────────────────
const DEFAULT_BACKGROUND = {
    type: 'image',
    value: 'https://res.cloudinary.com/div6l4vta/image/upload/v1758371343/wp5173701-study-motivation-wallpapers_yfpfoq.png'
};

// Default font colour (matches .note-content color in CSS)
const DEFAULT_FONT_COLOR = '#ffffff';

// ─── Wallpaper data source ────────────────────────────────────────────────────
// All wallpapers and gradients live in wallpapers.json.
// To add a new wallpaper: open wallpapers.json and append an entry to the
// "wallpapers" array. No changes needed to HTML, CSS, or this file.
const WALLPAPERS_JSON_URL = 'wallpapers.json';

class StickyNotesApp {
    constructor() {
        this.notes         = [];
        this.background    = null;
        this.wallpaperData = null;   // loaded from wallpapers.json on modal open
        this.noteColors    = ['color-lemon','color-rose','color-mint','color-sky','color-peach','color-lavender'];
        this.currentNoteId = null;
        this.searchQuery   = '';
        this._saveTimer    = null;
        this._drag         = null;
        this._flashTimer   = null;
        this._menuOpen     = false;

        this.init();
    }

    async init() {
        this.bindEvents();
        await this.loadSettings();
        await this.loadNotes();
        await this.checkFirstInstall();
    }

    // ══════════════════════════════════════════
    //  WALLPAPER DATA  (wallpapers.json)
    // ══════════════════════════════════════════

    /**
     * Fetch wallpapers.json once, cache result in this.wallpaperData.
     * Called lazily when the modal is first opened.
     */
    async fetchWallpaperData() {
        if (this.wallpaperData) return this.wallpaperData; // already loaded
        try {
            const resp = await fetch(WALLPAPERS_JSON_URL);
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            this.wallpaperData = await resp.json();
        } catch (err) {
            console.error('Failed to load wallpapers.json:', err);
            this.wallpaperData = { gradients: [], wallpapers: [] };
        }
        return this.wallpaperData;
    }

    /**
     * Populate the modal's gradient and wallpaper grids from the fetched data.
     * Inline background-image replaces the old nth-child CSS rules entirely.
     */
    renderWallpaperModal(data) {
        // ── Gradients ──────────────────────────────────────────────────────
        const gradientGrid = document.getElementById('gradientGrid');
        gradientGrid.innerHTML = data.gradients.map(g => `
            <div class="color-option"
                 data-bg-type="solid"
                 data-bg-value="${this.escapeAttr(g.value)}"
                 title="${this.escapeAttr(g.label)}"
                 style="background:${g.value};">
            </div>
        `).join('');

        // ── Wallpapers ─────────────────────────────────────────────────────
        const wallpaperGrid = document.getElementById('wallpaperGrid');
        wallpaperGrid.innerHTML = data.wallpapers.map(w => `
            <div class="wallpaper-option"
                 data-bg-type="image"
                 data-bg-value="${this.escapeAttr(w.full)}"
                 title="${this.escapeAttr(w.label)}"
                 style="background-image:url('${w.thumb}');">
            </div>
        `).join('');

        // Bind click events to the freshly rendered options
        this.bindWallpaperOptionEvents();

        // Mark the currently active background
        this.highlightActiveBackground();
    }

    bindWallpaperOptionEvents() {
        document.querySelectorAll('.color-option, .wallpaper-option').forEach(opt => {
            opt.addEventListener('click', () =>
                this.selectBackground(opt.dataset.bgType, opt.dataset.bgValue)
            );
        });
    }

    /** Visually mark whichever option matches the current background */
    highlightActiveBackground() {
        if (!this.background) return;
        document.querySelectorAll('.color-option, .wallpaper-option').forEach(opt => {
            const matches = opt.dataset.bgType  === this.background.type &&
                            opt.dataset.bgValue === this.background.value;
            opt.classList.toggle('selected', matches);
        });
    }

    // ══════════════════════════════════════════
    //  FIRST INSTALL
    // ══════════════════════════════════════════
    async checkFirstInstall() {
        try {
            const result = await chrome.storage.local.get(['tutorialDone']);
            if (!result.tutorialDone) {
                if (!this.background) {
                    this.background = DEFAULT_BACKGROUND;
                    this.applyBackground();
                    await this.saveSettings();
                }
                this.showTutorial();
            }
        } catch (e) { console.error('checkFirstInstall:', e); }
    }

    // ══════════════════════════════════════════
    //  TUTORIAL
    // ══════════════════════════════════════════
    showTutorial() { document.getElementById('tutorialOverlay').classList.remove('hidden'); }

    closeTutorial() {
        document.getElementById('tutorialOverlay').classList.add('hidden');
        chrome.storage.local.set({ tutorialDone: true });
    }

    goToStep(fromId, toId) {
        document.getElementById(fromId).classList.add('hidden');
        document.getElementById(toId).classList.remove('hidden');
    }

    bindTutorialEvents() {
        ['tutSkip1','tutSkip2','tutSkip3','tutSkip4'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('click', () => this.closeTutorial());
        });
        document.getElementById('tNext1').addEventListener('click', () => this.goToStep('tStep1','tStep2'));
        document.getElementById('tNext2').addEventListener('click', () => this.goToStep('tStep2','tStep3'));
        document.getElementById('tNext3').addEventListener('click', () => this.goToStep('tStep3','tStep4'));
        document.getElementById('tNext4').addEventListener('click', () => this.goToStep('tStep4','tStep5'));
        document.getElementById('tDone').addEventListener('click',  () => this.closeTutorial());
    }

    // ══════════════════════════════════════════
    //  BURGER MENU
    // ══════════════════════════════════════════
    toggleMenu() {
        this._menuOpen = !this._menuOpen;
        document.getElementById('burgerBtn').classList.toggle('open', this._menuOpen);
        document.getElementById('fabMenu').classList.toggle('hidden', !this._menuOpen);
    }

    closeMenu() {
        this._menuOpen = false;
        document.getElementById('burgerBtn').classList.remove('open');
        document.getElementById('fabMenu').classList.add('hidden');
    }

    // ══════════════════════════════════════════
    //  EVENT BINDING
    // ══════════════════════════════════════════
    bindEvents() {
        this.bindTutorialEvents();

        // Burger
        document.getElementById('burgerBtn').addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleMenu();
        });

        document.addEventListener('click', (e) => {
            if (!e.target.closest('.fab-wrapper')) this.closeMenu();
        });

        // Add note
        document.getElementById('addNoteBtn').addEventListener('click', () => {
            this.addNote();
            this.closeMenu();
        });

        // Background — open modal, lazily load wallpaper data
        document.getElementById('backgroundBtn').addEventListener('click', () => {
            this.showBackgroundModal();
            this.closeMenu();
        });

        document.getElementById('closeModal').addEventListener('click', () => this.hideBackgroundModal());
        document.getElementById('backgroundModal').addEventListener('click', (e) => {
            if (e.target.id === 'backgroundModal') this.hideBackgroundModal();
        });

        // Search
        const searchInput = document.getElementById('searchInput');
        const clearBtn    = document.getElementById('clearSearch');

        searchInput.addEventListener('input', () => {
            this.searchQuery = searchInput.value.trim();
            clearBtn.classList.toggle('visible', this.searchQuery.length > 0);
            this.renderNotes();
        });

        clearBtn.addEventListener('click', () => {
            searchInput.value = '';
            this.searchQuery  = '';
            clearBtn.classList.remove('visible');
            this.renderNotes();
        });

        // Context menu — open
        document.addEventListener('contextmenu', (e) => {
            const note = e.target.closest('.sticky-note');
            if (note && !e.target.closest('textarea,input,button,.todo-text,.todo-checkbox,.todo-delete-btn,.todo-add-btn')) {
                e.preventDefault();
                this.showContextMenu(e, note);
            } else if (!note) {
                this.hideContextMenu();
            }
        });

        // Context menu — close on outside click
        document.addEventListener('click', (e) => {
            if (!e.target.closest('#contextMenu')) this.hideContextMenu();
        });

        document.getElementById('pinNote').addEventListener('click', () => {
            if (this.currentNoteId) this.togglePinNote(this.currentNoteId);
            this.hideContextMenu();
        });

        document.getElementById('toggleTodo').addEventListener('click', () => {
            if (this.currentNoteId) this.toggleTodoMode(this.currentNoteId);
            this.hideContextMenu();
        });

        document.getElementById('deleteNote').addEventListener('click', () => {
            if (this.currentNoteId) this.deleteNote(this.currentNoteId);
            this.hideContextMenu();
        });

        // Note background colour swatches
        document.getElementById('contextColors').addEventListener('click', (e) => {
            const swatch = e.target.closest('.n-swatch');
            if (swatch && this.currentNoteId) {
                this.changeNoteColor(this.currentNoteId, swatch.dataset.color);
                this.hideContextMenu();
            }
        });

        // Font colour swatches
        document.getElementById('contextFontColors').addEventListener('click', (e) => {
            const swatch = e.target.closest('.f-swatch');
            if (swatch && this.currentNoteId) {
                this.changeNoteFontColor(this.currentNoteId, swatch.dataset.fcolor);
                this.hideContextMenu();
            }
        });

        // Textarea autosave
        document.addEventListener('input', (e) => {
            if (e.target.classList.contains('note-content')) {
                const noteId = e.target.closest('.sticky-note').dataset.noteId;
                this.updateNoteContent(noteId, e.target.value);
            }
        });

        // Drag
        document.addEventListener('mousedown', (e) => this.onMouseDown(e));
        document.addEventListener('mousemove', (e) => this.onMouseMove(e));
        document.addEventListener('mouseup',   (e) => this.onMouseUp(e));

        document.addEventListener('mousedown', (e) => {
            if (e.target.closest('.note-resize-handle')) {
                this.onResizeStart(e);
            }
        });

        document.addEventListener('mousemove', (e) => this.onResizeMove(e));
        document.addEventListener('mouseup', () => this.onResizeEnd());

    }

    // ══════════════════════════════════════════
    //  DRAG
    // ══════════════════════════════════════════
    onMouseDown(e) {
        const note = e.target.closest('.sticky-note');
        if (e.target.closest('.note-resize-handle')) {
            this.onResizeStart(e);
            return;
        }
        if (!note) return;
        if (e.target.closest('textarea,input,button,.todo-text,.todo-checkbox,.todo-delete-btn,.todo-add-btn')) return;
        if (e.button !== 0) return;

        this._drag = {
            noteId:   note.dataset.noteId,
            el:       note,
            startX:   e.clientX,
            startY:   e.clientY,
            origLeft: parseInt(note.style.left) || 0,
            origTop:  parseInt(note.style.top)  || 0,
            moved:    false,
        };
        note.classList.add('is-dragging');
        e.preventDefault();
    }

    onMouseMove(e) {
        if (!this._drag) return;
        const dx = e.clientX - this._drag.startX;
        const dy = e.clientY - this._drag.startY;
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) this._drag.moved = true;
        this._drag.el.style.left = Math.max(0, this._drag.origLeft + dx) + 'px';
        this._drag.el.style.top  = Math.max(0, this._drag.origTop  + dy) + 'px';
    }

    onMouseUp() {
        if (!this._drag) return;
        const { noteId, el, moved } = this._drag;
        el.classList.remove('is-dragging');
        if (moved) {
            const note = this.notes.find(n => n.id === noteId);
            if (note) {
                note.posX = parseInt(el.style.left);
                note.posY = parseInt(el.style.top);
                this.debounceSave();
            }
        }
        this._drag = null;
    }

    
    // RESIZE: Start
    onResizeStart(e) {
        if (e.button !== 0) return;

        const handle = e.target.closest('.note-resize-handle');
        if (!handle) return;

        const noteEl = handle.closest('.sticky-note');
        if (!noteEl) return;

        const noteId = noteEl.dataset.noteId;
        const note = this.notes.find(n => n.id === noteId);
        if (!note) return;

        this._resize = {
            noteId,
            el: noteEl,
            startX: e.clientX,
            startY: e.clientY,
            startWidth: noteEl.offsetWidth,
            startHeight: noteEl.offsetHeight
        };

        e.preventDefault();
        e.stopPropagation();
    }

    // RESIZE: Move
    onResizeMove(e) {
        if (!this._resize) return;

        const { el, startX, startY, startWidth, startHeight } = this._resize;

        const dx = e.clientX - startX;
        const dy = e.clientY - startY;

        el.style.width = Math.max(180, startWidth + dx) + 'px';
        el.style.height = Math.max(120, startHeight + dy) + 'px';
    }

    // RESIZE: End
    onResizeEnd() {
        if (!this._resize) return;

        const { noteId, el } = this._resize;
        const note = this.notes.find(n => n.id === noteId);

        if (note) {
            note.width = el.offsetWidth;
            note.height = el.offsetHeight;
            this.debounceSave();
        }

        this._resize = null;
    }


    // ══════════════════════════════════════════
    //  SETTINGS / BACKGROUND
    // ══════════════════════════════════════════
    async loadSettings() {
        try {
            const result = await chrome.storage.local.get(['backgroundSettings']);
            if (result.backgroundSettings) {
                this.background = result.backgroundSettings;
                this.applyBackground();
            }
        } catch (e) { console.error('loadSettings:', e); }
    }

    async saveSettings() {
        try {
            await chrome.storage.local.set({ backgroundSettings: this.background });
        } catch (e) { console.error('saveSettings:', e); }
    }

    applyBackground() {
        if (!this.background) return;
        document.body.style.background = this.background.type === 'image'
            ? `url('${this.background.value}') center center / cover no-repeat fixed`
            : this.background.value;
    }

    async showBackgroundModal() {
        document.getElementById('backgroundModal').classList.add('show');

        // Show loader until data is ready
        const loader  = document.getElementById('wallpaperLoader');
        const content = document.getElementById('wallpaperContent');
        loader.classList.remove('hidden');
        content.classList.add('hidden');

        const data = await this.fetchWallpaperData();
        this.renderWallpaperModal(data);

        loader.classList.add('hidden');
        content.classList.remove('hidden');
    }

    hideBackgroundModal() { document.getElementById('backgroundModal').classList.remove('show'); }

    selectBackground(type, value) {
        this.background = { type, value };
        this.applyBackground();
        this.saveSettings();
        this.highlightActiveBackground();
        this.hideBackgroundModal();
    }

    // ══════════════════════════════════════════
    //  NOTES CRUD
    // ══════════════════════════════════════════
    async loadNotes() {
        try {
            const result = await chrome.storage.local.get(['stickyNotes']);
            this.notes = result.stickyNotes || [];
            this.renderNotes();
        } catch (e) {
            console.error('loadNotes:', e);
            this.notes = [];
        }
    }

    async saveNotes() {
        try {
            await chrome.storage.local.set({ stickyNotes: this.notes });
            this.flashAutosave();
        } catch (e) { console.error('saveNotes:', e); }
    }

    debounceSave() {
        clearTimeout(this._saveTimer);
        this._saveTimer = setTimeout(() => this.saveNotes(), 800);
    }

    addNote() {
        const canvas = document.getElementById('notesContainer');
        const w = canvas.clientWidth  || window.innerWidth;
        const h = window.innerHeight;
        const posX = Math.max(10, Math.floor(Math.random() * Math.max(10, w - 280)));
        const posY = Math.max(10, Math.floor(Math.random() * Math.max(10, h * 0.55)));

        const newNote = {
            id:        this.generateId(),
            content:   '',
            color:     '',
            fontColor: DEFAULT_FONT_COLOR,
            createdAt: new Date().toISOString(),
            isPinned:  false,
            isTodo:    false,
            todos:     [],
            posX,
            posY,
        };

        this.notes.unshift(newNote);
        this.debounceSave();
        this.renderNotes();

        setTimeout(() => {
            const el = document.querySelector(`[data-note-id="${newNote.id}"] .note-content`);
            if (el) el.focus();
        }, 100);
    }

    deleteNote(noteId) {
        const el = document.querySelector(`[data-note-id="${noteId}"]`);
        if (el) {
            el.style.transition = 'opacity 0.2s, transform 0.2s';
            el.style.opacity    = '0';
            el.style.transform  = 'scale(0.7) rotate(10deg)';
        }
        setTimeout(() => {
            this.notes = this.notes.filter(n => n.id !== noteId);
            this.saveNotes();
            this.renderNotes();
        }, 210);
    }

    togglePinNote(noteId) {
        const note = this.notes.find(n => n.id === noteId);
        if (note) {
            note.isPinned  = !note.isPinned;
            note.updatedAt = new Date().toISOString();
            this.saveNotes();
            this.renderNotes();
        }
    }

    toggleTodoMode(noteId) {
        const note = this.notes.find(n => n.id === noteId);
        if (!note) return;
        note.isTodo = !note.isTodo;
        if (note.isTodo && (!note.todos || note.todos.length === 0)) {
            const lines = (note.content || '').split('\n').filter(l => l.trim());
            note.todos = lines.length
                ? lines.map(l => ({ id: this.generateId(), text: l, done: false }))
                : [{ id: this.generateId(), text: '', done: false }];
        }
        note.updatedAt = new Date().toISOString();
        this.saveNotes();
        this.renderNotes();
    }

    changeNoteColor(noteId, color) {
        const note = this.notes.find(n => n.id === noteId);
        if (!note) return;
        if (note.color === color) color = '';
        note.color     = color;
        note.updatedAt = new Date().toISOString();
        this.saveNotes();
        const el = document.querySelector(`[data-note-id="${noteId}"]`);
        if (el) {
            this.noteColors.forEach(c => el.classList.remove(c));
            if (color) el.classList.add(color);
        }
    }

    changeNoteFontColor(noteId, fontColor) {
        const note = this.notes.find(n => n.id === noteId);
        if (!note) return;
        note.fontColor = fontColor;
        note.updatedAt = new Date().toISOString();
        this.saveNotes();
        const noteEl = document.querySelector(`[data-note-id="${noteId}"]`);
        if (noteEl) this.applyFontColor(noteEl, fontColor);
    }

    applyFontColor(noteEl, fontColor) {
        const textarea = noteEl.querySelector('.note-content');
        if (textarea) textarea.style.color = fontColor;

        noteEl.querySelectorAll('.todo-text').forEach(inp => {
            inp.style.color = fontColor;
        });

        noteEl.querySelectorAll('.todo-checkbox').forEach(cb => {
            cb.style.accentColor = fontColor;
        });

        const ts = noteEl.querySelector('.note-timestamp');
        if (ts) ts.style.color = `${fontColor}88`;
    }

    updateNoteContent(noteId, content) {
        const note = this.notes.find(n => n.id === noteId);
        if (note) {
            note.content   = content;
            note.updatedAt = new Date().toISOString();
            this.debounceSave();
        }
    }

    // ── Todo ──────────────────────────────────
    addTodoItem(noteId) {
        const note = this.notes.find(n => n.id === noteId);
        if (!note) return;
        const item = { id: this.generateId(), text: '', done: false };
        note.todos.push(item);
        note.updatedAt = new Date().toISOString();
        this.debounceSave();
        this.rerenderTodoList(note);
        setTimeout(() => {
            const input = document.querySelector(`[data-note-id="${noteId}"] [data-todo-id="${item.id}"] .todo-text`);
            if (input) {
                input.style.color = note.fontColor || DEFAULT_FONT_COLOR;
                input.focus();
            }
        }, 50);
    }

    updateTodoItem(noteId, todoId, field, value) {
        const note = this.notes.find(n => n.id === noteId);
        if (!note) return;
        const item = note.todos.find(t => t.id === todoId);
        if (!item) return;
        item[field]    = value;
        note.updatedAt = new Date().toISOString();
        this.debounceSave();
        if (field === 'done') {
            const textEl = document.querySelector(`[data-note-id="${noteId}"] [data-todo-id="${todoId}"] .todo-text`);
            if (textEl) textEl.classList.toggle('done', value);
        }
    }

    deleteTodoItem(noteId, todoId) {
        const note = this.notes.find(n => n.id === noteId);
        if (!note) return;
        note.todos     = note.todos.filter(t => t.id !== todoId);
        note.updatedAt = new Date().toISOString();
        this.debounceSave();
        this.rerenderTodoList(note);
    }

    rerenderTodoList(note) {
        const container = document.querySelector(`[data-note-id="${note.id}"] .todo-list`);
        if (!container) return;
        container.innerHTML = this.createTodoItemsHTML(note);
        this.bindTodoEvents(note.id);
        const noteEl = document.querySelector(`[data-note-id="${note.id}"]`);
        if (noteEl && note.fontColor) this.applyFontColor(noteEl, note.fontColor);
    }

    // ══════════════════════════════════════════
    //  SEARCH
    // ══════════════════════════════════════════
    noteMatchesSearch(note) {
        if (!this.searchQuery) return true;
        const q = this.searchQuery.toLowerCase();
        return note.isTodo
            ? note.todos.some(t => t.text.toLowerCase().includes(q))
            : note.content.toLowerCase().includes(q);
    }

    // ══════════════════════════════════════════
    //  RENDER
    // ══════════════════════════════════════════
    getSortedNotes() {
        return [...this.notes].sort((a, b) => {
            if (a.isPinned && !b.isPinned) return -1;
            if (!a.isPinned && b.isPinned) return  1;
            return new Date(b.createdAt) - new Date(a.createdAt);
        });
    }

    renderNotes() {
        const container = document.getElementById('notesContainer');
        const sorted    = this.getSortedNotes();
        const filtered  = sorted.filter(n => this.noteMatchesSearch(n));

        const prevPos = {};
        container.querySelectorAll('.sticky-note').forEach(el => {
            prevPos[el.dataset.noteId] = { left: el.style.left, top: el.style.top };
        });

        container.innerHTML = filtered.map(n => this.createNoteHTML(n)).join('');

        container.querySelectorAll('.sticky-note').forEach(el => {
            const noteId = el.dataset.noteId;
            const note   = this.notes.find(n => n.id === noteId);
            const prev   = prevPos[noteId];

            if (prev && prev.left) {
                el.style.left = prev.left;
                el.style.top  = prev.top;
            } else if (note) {
                el.style.left = (note.posX || 10) + 'px';
                el.style.top  = (note.posY || 10) + 'px';
            }

            if (note) {
                if (note.width) {
                    el.style.width = note.width + 'px';
                }

                if (note.height) {
                    el.style.height = note.height + 'px';
                }
            }


            if (note && note.fontColor && note.fontColor !== DEFAULT_FONT_COLOR) {
                this.applyFontColor(el, note.fontColor);
            }

            if (note && note.isTodo) this.bindTodoEvents(noteId);
        });

        this.updateContainerHeight();
    }

    updateContainerHeight() {
        const container = document.getElementById('notesContainer');
        let maxBottom   = window.innerHeight;
        container.querySelectorAll('.sticky-note').forEach(el => {
            maxBottom = Math.max(maxBottom, (parseInt(el.style.top) || 0) + (el.offsetHeight || 270) + 30);
        });
        container.style.minHeight = maxBottom + 'px';
    }

    // ══════════════════════════════════════════
    //  HTML CREATION
    // ══════════════════════════════════════════
    formatDate(ds) {
        return new Date(ds).toLocaleDateString('en-US', {
            year:'numeric', month:'short', day:'numeric',
            hour:'2-digit', minute:'2-digit',
        });
    }

    escapeHTML(str) {
        return String(str)
            .replace(/&/g,'&amp;').replace(/</g,'&lt;')
            .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

    escapeAttr(str) {
        return String(str).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    createNoteHTML(note) {
        const pinnedClass = note.isPinned ? 'pinned' : '';
        const body = note.isTodo
            ? `<div class="todo-list">${this.createTodoItemsHTML(note)}</div>
               <button class="todo-add-btn" data-note-id="${note.id}">+ Add item</button>`
            : `<textarea class="note-content" placeholder="${this.getRandomPlaceholder()}" maxlength="1000">${this.escapeHTML(note.content)}</textarea>`;

        const colorClass = note.color || '';
        return `
            <div class="sticky-note ${colorClass} ${pinnedClass} new-note" data-note-id="${note.id}">
                ${note.isPinned ? '<div class="pin-indicator">📌</div>' : ''}
                <div class="note-tab"></div>
                ${body}
                <div class="note-footer">
                    <span class="note-timestamp">${this.formatDate(note.createdAt)}</span>
                </div>
                <div class="note-resize-handle" aria-label="Resize note" title="Drag to resize"></div>
            </div>`;
    }

    createTodoItemsHTML(note) {
        return (note.todos || []).map(item => `
            <div class="todo-item" data-todo-id="${item.id}">
                <input type="checkbox" class="todo-checkbox" ${item.done ? 'checked' : ''}>
                <input type="text" class="todo-text ${item.done ? 'done' : ''}"
                    value="${this.escapeHTML(item.text)}"
                    placeholder="Todo item…" maxlength="200">
                <button class="todo-delete-btn" title="Remove">✕</button>
            </div>`).join('');
    }

    bindTodoEvents(noteId) {
        const noteEl = document.querySelector(`[data-note-id="${noteId}"]`);
        if (!noteEl) return;

        noteEl.querySelectorAll('.todo-checkbox').forEach(cb => {
            cb.addEventListener('change', () => {
                this.updateTodoItem(noteId, cb.closest('.todo-item').dataset.todoId, 'done', cb.checked);
            });
        });

        noteEl.querySelectorAll('.todo-text').forEach(input => {
            input.addEventListener('input', () => {
                this.updateTodoItem(noteId, input.closest('.todo-item').dataset.todoId, 'text', input.value);
            });
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') { e.preventDefault(); this.addTodoItem(noteId); }
                if (e.key === 'Backspace' && input.value === '') {
                    e.preventDefault();
                    this.deleteTodoItem(noteId, input.closest('.todo-item').dataset.todoId);
                }
            });
        });

        noteEl.querySelectorAll('.todo-delete-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.deleteTodoItem(noteId, btn.closest('.todo-item').dataset.todoId);
            });
        });

        const addBtn = noteEl.querySelector('.todo-add-btn');
        // if (addBtn) addBtn.addEventListener('click', () => this.addTodoItem(noteId));
        if (addBtn && !addBtn.dataset.bound) {
    addBtn.dataset.bound = 'true';

    addBtn.addEventListener('click', () => {
        this.addTodoItem(noteId);
    });
}
    }

    // ══════════════════════════════════════════
    //  CONTEXT MENU
    // ══════════════════════════════════════════
    showContextMenu(event, noteEl) {
        const contextMenu  = document.getElementById('contextMenu');
        this.currentNoteId = noteEl.dataset.noteId;
        const note = this.notes.find(n => n.id === this.currentNoteId);

        document.getElementById('pinText').textContent  = note?.isPinned ? 'Unpin Note'     : 'Pin Note';
        document.getElementById('todoText').textContent = note?.isTodo   ? 'Switch to Text' : 'Switch to Todo';

        document.querySelectorAll('.n-swatch').forEach(s => {
            s.classList.toggle('active', !!(note && note.color && s.dataset.color === note.color));
        });

        document.querySelectorAll('.f-swatch').forEach(s => {
            const fc = note?.fontColor || DEFAULT_FONT_COLOR;
            s.classList.toggle('active', s.dataset.fcolor === fc);
        });

        contextMenu.style.display = 'block';
        contextMenu.style.left    = event.pageX + 'px';
        contextMenu.style.top     = event.pageY + 'px';

        requestAnimationFrame(() => {
            const rect = contextMenu.getBoundingClientRect();
            if (rect.right  > window.innerWidth)  contextMenu.style.left = (event.pageX - rect.width)  + 'px';
            if (rect.bottom > window.innerHeight)  contextMenu.style.top  = (event.pageY - rect.height) + 'px';
        });
    }

    hideContextMenu() {
        document.getElementById('contextMenu').style.display = 'none';
        this.currentNoteId = null;
    }

    // ══════════════════════════════════════════
    //  AUTOSAVE FLASH
    // ══════════════════════════════════════════
    flashAutosave() {
        const el = document.getElementById('autosaveIndicator');
        el.classList.add('show');
        clearTimeout(this._flashTimer);
        this._flashTimer = setTimeout(() => el.classList.remove('show'), 1600);
    }

    // ══════════════════════════════════════════
    //  UTILITIES
    // ══════════════════════════════════════════
    generateId()     { return Date.now().toString() + Math.random().toString(36).substr(2,5); }
    getRandomColor() { return this.noteColors[Math.floor(Math.random() * this.noteColors.length)]; }

    getRandomPlaceholder() {
        const list = [
            'Write your thoughts…', "Don't forget to…", 'Ideas & reminders…',
            'Quick note…', 'Remember this…', 'Brilliant idea!',
            'Shopping list…', 'Meeting notes…', 'Whats on your mind?'
        ];
        return list[Math.floor(Math.random() * list.length)];
    }
}

// ══════════════════════════════════════════
//  BOOT
// ══════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => { new StickyNotesApp(); });

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
        e.preventDefault();
        document.getElementById('addNoteBtn').click();
    }
    if (e.key === 'Escape') {
        if (document.getElementById('backgroundModal').classList.contains('show')) {
            document.getElementById('closeModal').click();
        }
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        const menu = document.getElementById('fabMenu');
        if (menu.classList.contains('hidden')) document.getElementById('burgerBtn').click();
        setTimeout(() => document.getElementById('searchInput').focus(), 80);
    }
});