/* =============================================================
   DESSERT HOUSE — retro cloud bakery kitchen
   Vanilla JavaScript. No dependencies, no build step.

   ▸ Contact details live ONLY in the CONFIG block below.
   ▸ Every WhatsApp / Instagram / mail / phone link on every page
     is filled in or updated from these values.
   ============================================================= */

const CONFIG = {
    /* ⚠️ whatsappNumber must be digits ONLY — no "+", spaces or dashes — because
       it is pasted straight into wa.me and tel: links. phoneDisplay is what the
       visitor actually reads, so format it however reads best. If the bakery
       ever moves to another country code, change BOTH together.            */
    whatsappNumber: '918292083443',
    phoneDisplay: '+91 82920 83443',
    instagramHandle: 'desserthouse_us',
    email: 'preetimarandi222@gmail.com',
    baker: 'Preeti Marandi',
    shopName: 'Dessert House'
};

const LINKS = {
    whatsapp: (text) =>
        'https://wa.me/' + CONFIG.whatsappNumber + (text ? '?text=' + encodeURIComponent(text) : ''),
    instagram: 'https://instagram.com/' + CONFIG.instagramHandle,
    email: 'mailto:' + CONFIG.email,
    phone: 'tel:+' + CONFIG.whatsappNumber
};

const BAG_KEY = 'dh.bag.v1';
const NOTES_KEY = 'dh.bag.notes.v1';

/* ---------- tiny helpers ---------- */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

document.addEventListener('DOMContentLoaded', () => {
    setYear();
    hydrateContactLinks();
    highlightCurrentPage();
    initMobileMenu();
    initReveal();
    initMenuFilters();
    initOrderBag();
    initOrderForm();
    initCopyButtons();
});

/* ---------- 1. Footer year ---------- */
function setYear() {
    $$('[data-year]').forEach((el) => { el.textContent = new Date().getFullYear(); });
}

/* ---------- 2. Contact details ---------- */
function hydrateContactLinks() {
    const map = {
        whatsapp: { href: LINKS.whatsapp(), text: CONFIG.phoneDisplay },
        instagram: { href: LINKS.instagram, text: '@' + CONFIG.instagramHandle },
        email: { href: LINKS.email, text: CONFIG.email },
        phone: { href: LINKS.phone, text: CONFIG.phoneDisplay }
    };

    $$('[data-contact]').forEach((el) => {
        const key = el.dataset.contact;
        if (!map[key]) return;
        el.setAttribute('href', map[key].href);
        if (key === 'whatsapp' || key === 'instagram') {
            el.setAttribute('target', '_blank');
            el.setAttribute('rel', 'noopener');
        }
        const target = el.dataset.contactText;
        if (target) {
            const slot = target === 'self' ? el : $(target);
            if (slot) slot.textContent = map[key].text;
        }
    });

    // Text-only slots: <span data-contact-slot="email"></span>
    $$('[data-contact-slot]').forEach((el) => {
        const key = el.dataset.contactSlot;
        if (!map[key]) return;
        el.textContent = key === 'instagram' ? '@' + CONFIG.instagramHandle : map[key].text;
    });
}

/* ---------- 3. Active page highlighting (top nav + mobile menu) ---------- */
function highlightCurrentPage() {
    const here = (location.pathname.split('/').pop() || 'index.html').toLowerCase();

    $$('a[data-page]').forEach((link) => {
        const target = link.getAttribute('href').toLowerCase();
        const isCurrent = target === here || (here === '' && target === 'index.html');
        if (isCurrent) {
            link.setAttribute('aria-current', 'page');
        } else {
            link.removeAttribute('aria-current');
        }
    });
}

/* ---------- 4. Mobile menu ---------- */
function initMobileMenu() {
    const toggle = $('[data-nav-toggle]');
    const menu = $('[data-mobile-menu]');
    if (!toggle || !menu) return;

    const close = () => {
        menu.classList.remove('is-open');
        toggle.setAttribute('aria-expanded', 'false');
    };

    toggle.addEventListener('click', () => {
        const open = menu.classList.toggle('is-open');
        toggle.setAttribute('aria-expanded', String(open));
    });

    $$('a', menu).forEach((a) => a.addEventListener('click', close));

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') close();
    });
}

/* ---------- 5. Reveal on scroll ---------- */
function initReveal() {
    const items = $$('.reveal');
    if (!items.length) return;

    if (!('IntersectionObserver' in window)) {
        items.forEach((el) => el.classList.add('is-visible'));
        return;
    }

    const io = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            if (entry.isIntersecting) {
                entry.target.classList.add('is-visible');
                io.unobserve(entry.target);
            }
        });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

    items.forEach((el) => io.observe(el));
}

/* ---------- 6. Menu category filters ---------- */
function initMenuFilters() {
    const chips = $$('[data-filter]');
    const cards = $$('[data-category]');
    if (!chips.length || !cards.length) return;

    chips.forEach((chip) => {
        chip.addEventListener('click', () => {
            const wanted = chip.dataset.filter;

            chips.forEach((c) => c.setAttribute('aria-pressed', String(c === chip)));
            cards.forEach((card) => {
                const show = wanted === 'all' || card.dataset.category === wanted;
                card.hidden = !show;
            });
        });
    });
}

/* ---------- 7. Order bag (saved in localStorage) ---------- */
function readBag() {
    try {
        const raw = JSON.parse(localStorage.getItem(BAG_KEY) || '[]');
        return Array.isArray(raw) ? raw.filter((i) => i && i.name && i.qty > 0) : [];
    } catch (err) {
        return [];
    }
}

function writeBag(bag) {
    try { localStorage.setItem(BAG_KEY, JSON.stringify(bag)); } catch (err) { /* private mode */ }
}

function readNotes() {
    try { return JSON.parse(localStorage.getItem(NOTES_KEY) || '{}') || {}; } catch (err) { return {}; }
}

function writeNotes(notes) {
    try { localStorage.setItem(NOTES_KEY, JSON.stringify(notes)); } catch (err) { /* private mode */ }
}

function initOrderBag() {
    const fab = $('[data-bag-open]');
    const drawer = $('[data-bag-drawer]');
    const backdrop = $('[data-bag-backdrop]');
    const list = $('[data-bag-list]');
    const count = $('[data-bag-count]');
    if (!drawer || !list || !count) return;

    const nameInput = $('[data-bag-name]');
    const noteInput = $('[data-bag-notes]');
    const saved = readNotes();
    if (nameInput) nameInput.value = saved.name || '';
    if (noteInput) noteInput.value = saved.notes || '';

    const saveNotes = () => {
        writeNotes({ name: nameInput ? nameInput.value : '', notes: noteInput ? noteInput.value : '' });
    };
    [nameInput, noteInput].forEach((el) => { if (el) el.addEventListener('input', saveNotes); });

    const changeQty = (name, delta) => {
        const bag = readBag();
        const found = bag.find((i) => i.name === name);
        if (!found) return;
        found.qty += delta;
        writeBag(bag.filter((i) => i.qty > 0));
        render();
    };

    function render() {
        const bag = readBag();
        const total = bag.reduce((sum, item) => sum + item.qty, 0);

        count.textContent = total;
        if (fab) fab.hidden = total === 0;

        list.innerHTML = '';
        if (!bag.length) {
            const li = document.createElement('li');
            li.className = 'bag-empty';
            li.textContent = 'Your bag is empty — add a treat first!';
            list.appendChild(li);
            return;
        }

        bag.forEach((item) => {
            const li = document.createElement('li');

            const label = document.createElement('span');
            label.textContent = item.name;

            const qty = document.createElement('span');
            qty.className = 'qty';

            const minus = document.createElement('button');
            minus.type = 'button';
            minus.textContent = '\u2212';
            minus.setAttribute('aria-label', 'Remove one ' + item.name);
            minus.addEventListener('click', () => changeQty(item.name, -1));

            const value = document.createElement('span');
            value.textContent = item.qty;

            const plus = document.createElement('button');
            plus.type = 'button';
            plus.textContent = '+';
            plus.setAttribute('aria-label', 'Add one more ' + item.name);
            plus.addEventListener('click', () => changeQty(item.name, 1));

            qty.append(minus, value, plus);
            li.append(label, qty);
            list.appendChild(li);
        });
    }

    const addItem = (name) => {
        const bag = readBag();
        const found = bag.find((i) => i.name === name);
        if (found) { found.qty += 1; } else { bag.push({ name: name, qty: 1 }); }
        writeBag(bag);
        render();
        toast(name + ' added to your bag');
    };

    const openDrawer = () => {
        drawer.classList.add('is-open');
        if (backdrop) backdrop.classList.add('is-open');
        document.body.style.overflow = 'hidden';
        const closeBtn = $('[data-bag-close]');
        if (closeBtn) closeBtn.focus();
    };

    const closeDrawer = () => {
        drawer.classList.remove('is-open');
        if (backdrop) backdrop.classList.remove('is-open');
        document.body.style.overflow = '';
    };

    $$('[data-add-item]').forEach((btn) => {
        btn.addEventListener('click', () => addItem(btn.dataset.addItem));
    });

    if (fab) fab.addEventListener('click', openDrawer);
    $$('[data-bag-close]').forEach((btn) => btn.addEventListener('click', closeDrawer));
    if (backdrop) backdrop.addEventListener('click', closeDrawer);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeDrawer(); });

    const send = $('[data-bag-send]');
    if (send) send.addEventListener('click', () => {
        const bag = readBag();
        if (!bag.length) {
            toast('Add a treat to your bag first');
            return;
        }
        openWhatsApp(bagMessage(bag, nameInput ? nameInput.value : '', noteInput ? noteInput.value : ''));
    });

    const clear = $('[data-bag-clear]');
    if (clear) clear.addEventListener('click', () => {
        writeBag([]);
        render();
        toast('Bag cleared');
    });

    render();
}

function bagMessage(bag, name, notes) {
    const lines = [
        '*' + CONFIG.shopName.toUpperCase() + ' \u2014 NEW ORDER*',
        '',
        'Hi ' + CONFIG.baker + '! I would like to order:',
        ''
    ];

    bag.forEach((item, i) => lines.push((i + 1) + '. ' + item.name + ' x' + item.qty));

    if (name.trim()) lines.push('', 'Name: ' + name.trim());
    if (notes.trim()) lines.push('Notes: ' + notes.trim());
    lines.push('', 'Sent from the Dessert House website \u2764');
    return lines.join('\n');
}

function openWhatsApp(text) {
    window.open(LINKS.whatsapp(text), '_blank', 'noopener');
}

/* ---------- 8. Contact page order form ---------- */
function initOrderForm() {
    const form = $('[data-order-form]');
    if (!form) return;

    const status = $('[data-order-status]');

    const collect = () => {
        const data = {};
        new FormData(form).forEach((value, key) => { data[key] = String(value).trim(); });
        return data;
    };

    const message = (data) => {
        const lines = [
            '*' + CONFIG.shopName.toUpperCase() + ' \u2014 ORDER REQUEST*',
            '',
            'Name: ' + data.name,
            'Phone / WhatsApp: ' + data.phone,
            'Treat: ' + data.treat,
            'Quantity: ' + data.quantity
        ];
        if (data.date) lines.push('Needed by: ' + data.date);
        if (data.handover) lines.push('Pickup or delivery: ' + data.handover);
        if (data.notes) lines.push('Flavour / design notes: ' + data.notes);
        lines.push('', 'Sent from the Dessert House website \u2764');
        return lines.join('\n');
    };

    const validate = (data) => {
        const required = ['name', 'phone', 'treat', 'quantity'];
        let firstBad = null;

        required.forEach((field) => {
            const input = form.elements[field];
            const wrap = input ? input.closest('.field') : null;
            const bad = !data[field];
            if (wrap) wrap.classList.toggle('field--error', bad);
            if (bad && !firstBad) firstBad = input;
        });

        if (firstBad) {
            firstBad.focus();
            return false;
        }
        return true;
    };

    form.addEventListener('submit', (e) => {
        e.preventDefault();
        const data = collect();
        if (!validate(data)) {
            if (status) status.textContent = 'Please fill the starred fields.';
            toast('Almost there \u2014 check the starred fields');
            return;
        }
        openWhatsApp(message(data));
        if (status) status.textContent = 'WhatsApp is opening with your order ready to send. \u2713';
        toast('Opening WhatsApp\u2026');
    });

    const mailBtn = $('[data-order-email]');
    if (mailBtn) mailBtn.addEventListener('click', () => {
        const data = collect();
        if (!validate(data)) {
            toast('Please fill the starred fields');
            return;
        }
        const subject = 'Order request \u2014 ' + CONFIG.shopName;
        window.location.href = LINKS.email +
            '?subject=' + encodeURIComponent(subject) +
            '&body=' + encodeURIComponent(message(data));
    });
}

/* ---------- 9. Copy-to-clipboard buttons ---------- */
const COPY_SOURCES = {
    email: () => CONFIG.email,
    phone: () => CONFIG.phoneDisplay,
    whatsapp: () => CONFIG.phoneDisplay,
    instagram: () => '@' + CONFIG.instagramHandle
};

function initCopyButtons() {
    $$('[data-copy], [data-copy-key]').forEach((btn) => {
        btn.addEventListener('click', async () => {
            const value = btn.dataset.copyKey
                ? (COPY_SOURCES[btn.dataset.copyKey] ? COPY_SOURCES[btn.dataset.copyKey]() : '')
                : btn.dataset.copy;

            if (!value) return;

            try {
                await navigator.clipboard.writeText(value);
                toast('Copied: ' + value);
            } catch (err) {
                toast('Copy not supported \u2014 please copy manually');
            }
        });
    });
}

/* ---------- 10. Toast ---------- */
let toastTimer = null;

function toast(text) {
    let el = $('.toast');
    if (!el) {
        el = document.createElement('div');
        el.className = 'toast';
        el.setAttribute('role', 'status');
        el.setAttribute('aria-live', 'polite');
        document.body.appendChild(el);
    }
    el.textContent = text;
    el.classList.add('is-visible');

    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('is-visible'), 2600);
}
