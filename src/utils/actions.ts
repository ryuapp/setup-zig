import process from "node:process";

export function input(name: string, fallback = ""): string {
  return (process.env[`INPUT_${name.toUpperCase().replaceAll("-", "_")}`] ||
    fallback).trim();
}

export function booleanInput(name: string, fallback: boolean): boolean {
  const value = input(name);
  return value ? value.toLowerCase() === "true" : fallback;
}

function command(name: string, value: string): void {
  process.stdout.write(
    `::${name}::${
      value.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A")
    }\n`,
  );
}

export function addPath(path: string): void {
  command("add-path", path);
}
export function setOutput(name: string, value: string): void {
  command(`set-output name=${name}`, value);
}
export function setState(name: string, value: string): void {
  command(`save-state name=${name}`, value);
}
export function info(message: string): void {
  console.log(message);
}
export function state(name: string): string {
  return process.env[`STATE_${name.toUpperCase().replaceAll("-", "_")}`] || "";
}
