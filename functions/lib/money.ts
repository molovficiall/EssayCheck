export function dollarsToCents(value: string): number {
  if (!/^(?:0|[1-9]\d{0,5})(?:\.\d{1,2})?$/.test(value))
    throw new Error('Invalid price');
  const [whole, fraction = ''] = value.split('.');
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
}

export function formatCents(cents: number, currency: string): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(
    cents / 100,
  );
}

export function getLinePrice(base: number, override: number | null): number {
  return override ?? base;
}
