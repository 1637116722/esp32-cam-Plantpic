function getLuminance(hex: string) {
    const c = hex.replace('#', '');
    const r = parseInt(c.substring(0, 2), 16) / 255;
    const g = parseInt(c.substring(2, 4), 16) / 255;
    const b = parseInt(c.substring(4, 6), 16) / 255;
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function getAutoTextColor(bg: string) {
    const l = getLuminance(bg);
    if (l > 0.55) {
        return '#0F172A';
    }
    if (l > 0.3) {
        return '#E5E7EB';
    }
    return '#F8FAFC';
}

export function getTimeTheme() {

    const bg = '#F1F3F2';
    const ambient = 1.25;
    const directional = 2.0;

    return {
        bg,
        fg: getAutoTextColor(bg),
        ambient,
        directional,
    };
}
