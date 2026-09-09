// eslint-disable-next-line no-control-regex
const INVALID_CHARACTERS = /[\u0000-\u001f\u007f\\/:*?"<>|]/g;
const RESERVED_WINDOWS_NAME = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;
const MAX_SEGMENT_CODEPOINTS = 100;
const MAX_RELATIVE_PATH_CODEPOINTS = 220;

function shortHash(value: string): string {
  let hash = 0x811c9dc5;
  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36).padStart(7, '0').slice(0, 7);
}

function truncateCodePoints(value: string, length: number): string {
  return Array.from(value).slice(0, Math.max(0, length)).join('');
}

function splitExtension(value: string): [string, string] {
  const index = value.lastIndexOf('.');
  if (index <= 0 || index === value.length - 1) return [value, ''];
  return [value.slice(0, index), value.slice(index)];
}

export function sanitizeSegment(input: string): string {
  const normalized = input
    .normalize('NFC')
    .replace(INVALID_CHARACTERS, '_')
    .replace(/\s+/g, ' ')
    .replace(/[ .]+$/g, '')
    .trim();

  let safe =
    normalized && normalized !== '.' && normalized !== '..' ? normalized : '_';
  if (RESERVED_WINDOWS_NAME.test(safe)) safe = `_${safe}`;

  if (Array.from(safe).length <= MAX_SEGMENT_CODEPOINTS) return safe;

  const [stem, extension] = splitExtension(safe);
  const suffix = `~${shortHash(safe)}`;
  const extensionLimit = Math.min(Array.from(extension).length, 16);
  const safeExtension = truncateCodePoints(extension, extensionLimit);
  const stemLimit =
    MAX_SEGMENT_CODEPOINTS - suffix.length - safeExtension.length;
  return `${truncateCodePoints(stem, stemLimit)}${suffix}${safeExtension}`;
}

function comparableName(value: string): string {
  return sanitizeSegment(value).replace(/\s+/g, ' ').trim().toLocaleLowerCase();
}

export function shouldFlattenSingleFileFolder(
  folderName: string,
  fileName: string,
  siblingCount: number,
  childFolderCount: number,
): boolean {
  if (siblingCount !== 1 || childFolderCount !== 0) return false;
  const [fileStem] = splitExtension(fileName);
  return comparableName(folderName) === comparableName(fileStem);
}

export function buildTargetPath(
  courseFolder: string,
  relativeFolders: string[],
  fileName: string,
): string {
  const segments = [
    'BB',
    sanitizeSegment(courseFolder),
    ...relativeFolders.map(sanitizeSegment),
    sanitizeSegment(fileName),
  ];

  let path = segments.join('/');
  if (Array.from(path).length <= MAX_RELATIVE_PATH_CODEPOINTS) return path;

  const shortened = [...segments];
  for (let index = shortened.length - 2; index >= 2; index -= 1) {
    const current = shortened[index];
    if (!current) continue;
    shortened[index] =
      `${truncateCodePoints(current, 18)}~${shortHash(current)}`;
    path = shortened.join('/');
    if (Array.from(path).length <= MAX_RELATIVE_PATH_CODEPOINTS) return path;
  }

  const identity = segments.join('/');
  const finalName = shortened.at(-1) ?? '_';
  return [
    'BB',
    truncateCodePoints(shortened[1] ?? '_', 32),
    `_path~${shortHash(identity)}`,
    finalName,
  ].join('/');
}
