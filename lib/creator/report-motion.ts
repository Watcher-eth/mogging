export const smoothMotion = (value: number) => { const amount = Math.max(0, Math.min(1, value)); return amount ** 3 * (amount * (amount * 6 - 15) + 10) }
