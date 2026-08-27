import AsyncStorage from '@react-native-async-storage/async-storage'
import { Directory, File, Paths } from 'expo-file-system'
import { Platform } from 'react-native'
import type { ScanUploadFile } from '../../api/scanUpload'
import type { StaffScanUploadMode } from './checkedPaperPipelineModel'

const STORAGE_PREFIX = 'eduraa:scan-upload-draft:v1'

export type ScanUploadDraft = {
  staffUploadMode: StaffScanUploadMode
  selectedPaperId: string
  selectedExamId: string
  selectedSubjectId: string
  selectedStudentId: string
  files: ScanUploadFile[]
  savedAt: string
}

function safeSegment(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]+/g, '-').slice(0, 80) || 'anonymous'
}

function draftKey(userId: string) {
  return `${STORAGE_PREFIX}:${safeSegment(userId)}`
}

function draftDirectory(userId: string) {
  return new Directory(Paths.document, 'scan-upload-drafts', safeSegment(userId))
}

function isOwnedDraftUri(uri: string, userId: string) {
  return uri.startsWith(draftDirectory(userId).uri)
}

export async function persistScanUploadFile(file: ScanUploadFile, userId: string) {
  if (Platform.OS === 'web' || file.file || isOwnedDraftUri(file.uri, userId)) return file

  const source = new File(file.uri)
  if (!source.exists) throw new Error(`${file.name} is no longer available on this device.`)
  const directory = draftDirectory(userId)
  directory.create({ idempotent: true, intermediates: true })
  const safeName = safeSegment(file.name.replace(/\.[^.]+$/, ''))
  const extension = file.name.match(/\.[a-zA-Z0-9]+$/)?.[0] ?? ''
  const destination = new File(directory, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeName}${extension}`)
  source.copy(destination)
  return {
    ...file,
    uri: destination.uri,
    size: file.size ?? destination.size,
  }
}

export function deletePersistedScanUploadFile(file: ScanUploadFile, userId: string) {
  if (Platform.OS === 'web' || !isOwnedDraftUri(file.uri, userId)) return
  const stored = new File(file.uri)
  if (stored.exists) stored.delete()
}

export async function saveScanUploadDraft(userId: string, draft: Omit<ScanUploadDraft, 'savedAt'>) {
  const serializable = {
    ...draft,
    files: Platform.OS === 'web' ? [] : draft.files.map(({ file: _file, ...item }) => item),
    savedAt: new Date().toISOString(),
  }
  await AsyncStorage.setItem(draftKey(userId), JSON.stringify(serializable))
}

export async function loadScanUploadDraft(userId: string): Promise<ScanUploadDraft | null> {
  const raw = await AsyncStorage.getItem(draftKey(userId))
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as ScanUploadDraft
    const files = Platform.OS === 'web'
      ? []
      : (parsed.files ?? []).filter((file) => {
          try {
            return isOwnedDraftUri(file.uri, userId) && new File(file.uri).exists
          } catch {
            return false
          }
        })
    return {
      staffUploadMode: parsed.staffUploadMode === 'custom_paper' ? 'custom_paper' : 'ai_generation_system',
      selectedPaperId: String(parsed.selectedPaperId ?? ''),
      selectedExamId: String(parsed.selectedExamId ?? ''),
      selectedSubjectId: String(parsed.selectedSubjectId ?? ''),
      selectedStudentId: String(parsed.selectedStudentId ?? ''),
      files,
      savedAt: String(parsed.savedAt ?? ''),
    }
  } catch {
    await AsyncStorage.removeItem(draftKey(userId))
    return null
  }
}

export async function clearScanUploadDraft(userId: string) {
  await AsyncStorage.removeItem(draftKey(userId))
  if (Platform.OS === 'web') return
  const directory = draftDirectory(userId)
  if (directory.exists) directory.delete()
}
