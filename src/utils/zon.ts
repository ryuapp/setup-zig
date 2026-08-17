function removeComments(source: string): string {
  let result = "";
  let inString = false;
  let escaped = false;
  for (let index = 0; index < source.length; index++) {
    const character = source.at(index);
    const next = source.at(index + 1);
    if (inString) {
      result += character;
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
    } else if (character === '"') {
      inString = true;
      result += character;
    } else if (character === "/" && next === "/") {
      while (index < source.length && source[index] !== "\n") index++;
      result += "\n";
    } else {
      result += character;
    }
  }
  return result;
}

export function getMinimumVersion(content: string): string | undefined {
  return removeComments(content).match(
    /\.minimum_zig_version\s*=\s*"([^"]+)"/,
  )?.[1];
}
