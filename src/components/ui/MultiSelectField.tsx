import React, { useMemo, useState } from 'react'
import { FlatList, Modal, Pressable, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { colors } from '../../theme/colors'
import { fonts } from '../../theme/fonts'
import { radius, shadows, spacing } from '../../theme/spacing'
import type { SelectOption } from './SelectField'

interface MultiSelectFieldProps {
  label: string
  values: string[]
  placeholder?: string
  options: SelectOption[]
  disabled?: boolean
  loading?: boolean
  error?: string
  searchable?: boolean
  onChange: (values: string[]) => void
}

export function MultiSelectField({
  label,
  values,
  placeholder = 'Select',
  options,
  disabled = false,
  loading = false,
  error,
  searchable = true,
  onChange,
}: MultiSelectFieldProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  const selectedLabels = options.filter((option) => values.includes(option.value)).map((option) => option.label)
  const filteredOptions = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return options
    return options.filter((option) => option.label.toLowerCase().includes(needle))
  }, [options, query])

  const canOpen = !disabled && !loading && options.length > 0

  const toggleValue = (value: string) => {
    onChange(values.includes(value) ? values.filter((existing) => existing !== value) : [...values, value])
  }

  return (
    <View style={styles.root}>
      <Text style={styles.label}>{label}</Text>
      <TouchableOpacity
        activeOpacity={0.88}
        disabled={!canOpen}
        onPress={() => setOpen(true)}
        style={[styles.trigger, error && styles.triggerError, !canOpen && styles.triggerDisabled]}
      >
        <Text style={[styles.value, selectedLabels.length === 0 && styles.placeholder]} numberOfLines={1}>
          {loading ? 'Loading...' : selectedLabels.length > 0 ? selectedLabels.join(', ') : placeholder}
        </Text>
        {selectedLabels.length > 0 ? (
          <View style={styles.countPill}>
            <Text style={styles.countPillText}>{selectedLabels.length}</Text>
          </View>
        ) : null}
        <Ionicons name="chevron-down" size={18} color={disabled ? colors.textSubtle : colors.accentStrong} />
      </TouchableOpacity>
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)} />
        <View style={styles.sheet}>
          <View style={styles.sheetGrabber} />
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>{label}</Text>
            <TouchableOpacity style={styles.closeButton} onPress={() => setOpen(false)}>
              <Ionicons name="close" size={18} color={colors.text} />
            </TouchableOpacity>
          </View>
          {searchable && options.length > 8 ? (
            <View style={styles.searchWrap}>
              <Ionicons name="search" size={17} color={colors.textMuted} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Search"
                placeholderTextColor={colors.textSubtle}
                style={styles.searchInput}
                autoCorrect={false}
              />
            </View>
          ) : null}
          <FlatList
            data={filteredOptions}
            keyExtractor={(item) => item.value}
            style={styles.list}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => {
              const active = values.includes(item.value)
              return (
                <TouchableOpacity
                  activeOpacity={0.86}
                  style={[styles.option, active && styles.optionActive]}
                  onPress={() => toggleValue(item.value)}
                >
                  <Text style={[styles.optionText, active && styles.optionTextActive]} numberOfLines={2}>{item.label}</Text>
                  <Ionicons name={active ? 'checkmark-circle' : 'ellipse-outline'} size={20} color={active ? colors.accentStrong : colors.textSubtle} />
                </TouchableOpacity>
              )
            }}
            ListEmptyComponent={<Text style={styles.empty}>No options found.</Text>}
          />
          <TouchableOpacity style={styles.doneButton} onPress={() => { setOpen(false); setQuery('') }}>
            <Text style={styles.doneButtonText}>Done</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    gap: spacing[2],
  },
  label: {
    color: colors.textMuted,
    fontFamily: fonts.semibold,
    fontSize: 12,
    letterSpacing: 0.3,
  },
  trigger: {
    minHeight: 56,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.backgroundElevated,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing[3],
    paddingHorizontal: spacing[4],
  },
  triggerError: {
    borderColor: colors.danger,
  },
  triggerDisabled: {
    opacity: 0.62,
  },
  value: {
    flex: 1,
    color: colors.text,
    fontFamily: fonts.medium,
    fontSize: 15,
  },
  placeholder: {
    color: colors.textSubtle,
  },
  countPill: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentSurfaceStrong,
  },
  countPillText: {
    color: colors.accentStrong,
    fontFamily: fonts.bold,
    fontSize: 11,
  },
  error: {
    color: colors.danger,
    fontFamily: fonts.medium,
    fontSize: 12,
  },
  backdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: '78%',
    borderTopLeftRadius: radius['2xl'],
    borderTopRightRadius: radius['2xl'],
    backgroundColor: colors.backgroundElevated,
    padding: spacing[5],
    gap: spacing[4],
    ...shadows.lg,
  },
  sheetGrabber: {
    alignSelf: 'center',
    width: 42,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.borderStrong,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing[4],
  },
  sheetTitle: {
    flex: 1,
    color: colors.text,
    fontFamily: fonts.displaySemibold,
    fontSize: 22,
  },
  closeButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  searchWrap: {
    minHeight: 48,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    paddingHorizontal: spacing[4],
  },
  searchInput: {
    flex: 1,
    color: colors.text,
    fontFamily: fonts.medium,
    fontSize: 14,
  },
  list: {
    marginHorizontal: -spacing[1],
  },
  option: {
    minHeight: 52,
    borderRadius: radius.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing[3],
    paddingHorizontal: spacing[4],
    marginBottom: spacing[2],
  },
  optionActive: {
    backgroundColor: colors.accentSurfaceStrong,
  },
  optionText: {
    flex: 1,
    color: colors.text,
    fontFamily: fonts.medium,
    fontSize: 14,
  },
  optionTextActive: {
    color: colors.accentStrong,
    fontFamily: fonts.bold,
  },
  empty: {
    color: colors.textMuted,
    fontFamily: fonts.medium,
    fontSize: 14,
    padding: spacing[4],
    textAlign: 'center',
  },
  doneButton: {
    minHeight: 48,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentStrong,
  },
  doneButtonText: {
    color: colors.white,
    fontFamily: fonts.bold,
    fontSize: 15,
  },
})

export default MultiSelectField
