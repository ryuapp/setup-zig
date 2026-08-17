import { appendFileSync } from "node:fs";
import process from "node:process";

export function input(name: string, fallback = ""): string {
  return (process.env[`INPUT_${name.toUpperCase().replaceAll("-", "_")}`] ||
    fallback).trim();
}

export function booleanInput(name: string, fallback: boolean): boolean {
  const value = input(name);
  return value ? value.toLowerCase() === "true" : fallback;
}

function appendEnvironmentFile(name: string, value: string): void {
  const path = process.env[name];
  if (!path) throw new Error(`${name} is not available`);
  appendFileSync(path, `${value}\n`, "utf8");
}

export function addPath(path: string): void {
  appendEnvironmentFile("GITHUB_PATH", path);
}
export function setOutput(name: string, value: string): void {
  appendEnvironmentFile("GITHUB_OUTPUT", `${name}=${value}`);
}
export function setState(name: string, value: string): void {
  appendEnvironmentFile("GITHUB_STATE", `${name}=${value}`);
}
export function info(message: string): void {
  console.log(message);
}
export function state(name: string): string {
  return process.env[`STATE_${name.toUpperCase().replaceAll("-", "_")}`] || "";
}
