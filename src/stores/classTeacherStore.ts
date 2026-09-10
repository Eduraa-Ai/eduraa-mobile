import { create } from 'zustand'

interface ClassTeacherState {
  /** Class selected for the whole class-teacher workspace. */
  activeClassId: string | null
  setActiveClassId: (classId: string | null) => void
  /** Semester selected for the whole class-teacher workspace. */
  activeSemesterId: string | null
  setActiveSemesterId: (semesterId: string | null) => void
  reset: () => void
}

export const useClassTeacherStore = create<ClassTeacherState>((set) => ({
  activeClassId: null,
  setActiveClassId: (activeClassId) => set({ activeClassId }),
  activeSemesterId: null,
  setActiveSemesterId: (activeSemesterId) => set({ activeSemesterId }),
  reset: () => set({ activeClassId: null, activeSemesterId: null }),
}))
