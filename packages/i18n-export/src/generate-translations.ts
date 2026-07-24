import { randomUUID } from 'node:crypto'
import * as fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import type { SupportedLocale } from './config.js'
import {
  formatLocaleJson,
  toSortedMessageMap,
  type LocaleTranslations,
} from './translation-validator.js'

export interface GeneratedLocaleFile {
  locale: SupportedLocale
  relativeName: string
  absolutePath: string
  keyCount: number
  fallbackCount: number
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await fs.access(target)
    return true
  } catch {
    return false
  }
}

async function rmIfExists(target: string): Promise<void> {
  await fs.rm(target, { recursive: true, force: true })
}

/**
 * Write UTF-8 content via a same-directory temp file, then replace the target.
 * On Windows, unlink the destination first when rename-over-existing fails.
 */
export async function atomicWriteFile(
  targetPath: string,
  content: string,
): Promise<void> {
  await fs.mkdir(path.dirname(targetPath), { recursive: true })
  const tempPath = path.join(
    path.dirname(targetPath),
    `.${path.basename(targetPath)}.${process.pid}.${randomUUID()}.tmp`,
  )
  await fs.writeFile(tempPath, content, { encoding: 'utf8' })
  try {
    await fs.rename(tempPath, targetPath)
  } catch {
    await fs.rm(targetPath, { force: true })
    await fs.rename(tempPath, targetPath)
  }
}

interface DestinationWrite {
  targetPath: string
  content: string
}

export interface FilePromoteOps {
  rename: (from: string, to: string) => Promise<void>
}

/**
 * Promote many files together: stage all, backup existing, swap all, restore on failure.
 * Avoids leaving one locale updated while another remains stale.
 */
export async function replaceFilesAtomically(
  destinations: DestinationWrite[],
  ops: FilePromoteOps = { rename: (from, to) => fs.rename(from, to) },
): Promise<void> {
  const stagingRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'i18n-export-'))
  const backups: Array<{ target: string; backup: string }> = []
  const promoted: string[] = []
  const { rename } = ops

  try {
    const stagedPaths: Array<{ target: string; staged: string }> = []

    for (const [index, destination] of destinations.entries()) {
      await fs.mkdir(path.dirname(destination.targetPath), { recursive: true })
      const staged = path.join(
        stagingRoot,
        `${index}-${path.basename(destination.targetPath)}`,
      )
      await fs.writeFile(staged, destination.content, 'utf8')
      stagedPaths.push({ target: destination.targetPath, staged })
    }

    for (const entry of stagedPaths) {
      if (await pathExists(entry.target)) {
        const backup = `${entry.target}.bak.${randomUUID()}`
        await rename(entry.target, backup)
        backups.push({ target: entry.target, backup })
      }
    }

    try {
      for (const entry of stagedPaths) {
        await rename(entry.staged, entry.target)
        promoted.push(entry.target)
      }
    } catch (error) {
      for (const target of promoted) {
        await rmIfExists(target)
      }
      for (const entry of backups) {
        try {
          await rename(entry.backup, entry.target)
        } catch {
          // Preserve original error.
        }
      }
      throw error
    }

    for (const entry of backups) {
      await rmIfExists(entry.backup)
    }
  } finally {
    await rmIfExists(stagingRoot)
  }
}

export interface WriteLocalesResult {
  distFiles: GeneratedLocaleFile[]
  pwaFiles: GeneratedLocaleFile[]
}

/**
 * Stage both locale JSON files, then promote to dist/ and PWA locales together.
 * Validation must already have succeeded for all locales before calling this.
 */
export async function writeValidatedLocaleFiles(options: {
  locales: LocaleTranslations[]
  distLocalesDir: string
  pwaLocalesDir: string
}): Promise<WriteLocalesResult> {
  const { locales, distLocalesDir, pwaLocalesDir } = options

  await fs.mkdir(distLocalesDir, { recursive: true })
  await fs.mkdir(pwaLocalesDir, { recursive: true })

  const destinations: DestinationWrite[] = []
  const distFiles: GeneratedLocaleFile[] = []
  const pwaFiles: GeneratedLocaleFile[] = []

  for (const localeData of locales) {
    const messages = toSortedMessageMap(localeData)
    const content = formatLocaleJson(localeData.locale, messages)
    const fileName = `${localeData.locale}.json`
    const distPath = path.join(distLocalesDir, fileName)
    const pwaPath = path.join(pwaLocalesDir, fileName)
    const keyCount = Object.keys(messages).length

    destinations.push({ targetPath: distPath, content })
    destinations.push({ targetPath: pwaPath, content })

    distFiles.push({
      locale: localeData.locale,
      relativeName: fileName,
      absolutePath: distPath,
      keyCount,
      fallbackCount: localeData.fallbackCount,
    })
    pwaFiles.push({
      locale: localeData.locale,
      relativeName: fileName,
      absolutePath: pwaPath,
      keyCount,
      fallbackCount: localeData.fallbackCount,
    })
  }

  await replaceFilesAtomically(destinations)
  return { distFiles, pwaFiles }
}

export function reportSafeExportSummary(result: WriteLocalesResult): void {
  for (const file of result.distFiles) {
    console.info(
      `${file.locale}: ${file.keyCount} keys, ${file.fallbackCount} used Default fallback`,
    )
    console.info(`Generated ${file.relativeName} → ${file.absolutePath}`)
  }
  for (const file of result.pwaFiles) {
    console.info(`Copied ${file.relativeName} → ${file.absolutePath}`)
  }
}
