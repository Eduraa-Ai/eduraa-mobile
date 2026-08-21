import React, { useMemo, useState } from 'react'
import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { addMonths, eachDayOfInterval, endOfMonth, format, getDay, isSameDay, isToday, parseISO, startOfMonth, subMonths } from 'date-fns'
import { colors } from '../../theme/colors'
import { fonts } from '../../theme/fonts'
import { radius, shadows, spacing } from '../../theme/spacing'

interface DateFieldProps {
  label: string
  value?: string
  placeholder?: string
  disabled?: boolean
  error?: string
  onChange: (value: string) => void
}

const weekdayLabels = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

export function DateField({ label, value, placeholder = 'Select date', disabled = false, error, onChange }: DateFieldProps) {
  const [open, setOpen] = useState(false)
  const selectedDate = useMemo(() => {
    if (!value) return null
    const parsed = parseISO(value)
    return Number.isNaN(parsed.getTime()) ? null : parsed
  }, [value])
  const [visibleMonth, setVisibleMonth] = useState(() => selectedDate ?? new Date())

  const openPicker = () => {
    setVisibleMonth(selectedDate ?? new Date())
    setOpen(true)
  }

  const days = useMemo(() => {
    return eachDayOfInterval({ start: startOfMonth(visibleMonth), end: endOfMonth(visibleMonth) })
  }, [visibleMonth])
  const leadingBlanks = getDay(startOfMonth(visibleMonth))

  return (
    <View style={styles.root}>
      <Text style={styles.label}>{label}</Text>
      <TouchableOpacity
        activeOpacity={0.88}
        disabled={disabled}
        onPress={openPicker}
        style={[styles.trigger, error && styles.triggerError, disabled && styles.triggerDisabled]}
      >
        <Ionicons name="calendar" size={17} color={colors.textMuted} />
        <Text style={[styles.value, !selectedDate && styles.placeholder]} numberOfLines={1}>
          {selectedDate ? format(selectedDate, 'MMM d, yyyy') : placeholder}
        </Text>
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

          <View style={styles.monthNav}>
            <TouchableOpacity style={styles.monthNavButton} onPress={() => setVisibleMonth((current) => subMonths(current, 1))}>
              <Ionicons name="chevron-back" size={18} color={colors.text} />
            </TouchableOpacity>
            <Text style={styles.monthLabel}>{format(visibleMonth, 'MMMM yyyy')}</Text>
            <TouchableOpacity style={styles.monthNavButton} onPress={() => setVisibleMonth((current) => addMonths(current, 1))}>
              <Ionicons name="chevron-forward" size={18} color={colors.text} />
            </TouchableOpacity>
          </View>

          <View style={styles.weekdayRow}>
            {weekdayLabels.map((day, index) => (
              <Text key={`${day}-${index}`} style={styles.weekdayLabel}>{day}</Text>
            ))}
          </View>

          <View style={styles.grid}>
            {Array.from({ length: leadingBlanks }).map((_, index) => (
              <View key={`blank-${index}`} style={styles.dayCell} />
            ))}
            {days.map((day) => {
              const active = selectedDate ? isSameDay(day, selectedDate) : false
              return (
                <TouchableOpacity
                  key={day.toISOString()}
                  style={styles.dayCell}
                  onPress={() => {
                    onChange(format(day, 'yyyy-MM-dd'))
                    setOpen(false)
                  }}
                >
                  <View style={[styles.dayCircle, active && styles.dayCircleActive]}>
                    <Text style={[styles.dayText, active && styles.dayTextActive, isToday(day) && !active && styles.dayTextToday]}>
                      {format(day, 'd')}
                    </Text>
                  </View>
                </TouchableOpacity>
              )
            })}
          </View>
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
  monthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  monthNavButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  monthLabel: {
    color: colors.text,
    fontFamily: fonts.bold,
    fontSize: 16,
  },
  weekdayRow: {
    flexDirection: 'row',
  },
  weekdayLabel: {
    width: `${100 / 7}%`,
    textAlign: 'center',
    color: colors.textMuted,
    fontFamily: fonts.semibold,
    fontSize: 11,
    letterSpacing: 0.4,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayCell: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayCircleActive: {
    backgroundColor: colors.accentStrong,
  },
  dayText: {
    color: colors.text,
    fontFamily: fonts.medium,
    fontSize: 14,
  },
  dayTextActive: {
    color: colors.white,
    fontFamily: fonts.bold,
  },
  dayTextToday: {
    color: colors.accentStrong,
    fontFamily: fonts.bold,
  },
})

export default DateField
