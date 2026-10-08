function toClassNames(inputs: unknown[]): string {
  const classes: string[] = [];
  for (const input of inputs) {
    if (input == null) continue;
    if (typeof input === "string" || typeof input === "number") {
      classes.push(String(input));
    } else if (Array.isArray(input)) {
      classes.push(toClassNames(input));
    } else if (typeof input === "object") {
      for (const key of Object.keys(input)) {
        if ((input as { [key: string]: unknown })[key]) classes.push(key);
      }
    }
  }
  return classes.join(" ");
}

export function cn(...inputs: unknown[]): string {
  return toClassNames(inputs)
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .join(" ");
}
