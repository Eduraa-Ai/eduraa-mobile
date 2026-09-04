import React, { useCallback, useMemo, useState } from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type ImageStyle,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { API_BASE_URL } from "../../api/client";
import { colors, radius, spacing, typography } from "../../theme";
import type { QuestionVisualPayload } from "../../types";
import {
  getQuestionVisualAssetUrls,
  resolveQuestionVisualUrl,
} from "../../utils/questionVisual";
import { ProtectedContentImage } from "./ProtectedContentImage";

type QuestionVisualProps = {
  visual: QuestionVisualPayload;
  style?: StyleProp<ImageStyle>;
  containerStyle?: StyleProp<ViewStyle>;
};

type QuestionVisualAssetProps = {
  uri: string;
  alt: string;
  caption?: string;
  style?: StyleProp<ImageStyle>;
  containerStyle?: StyleProp<ViewStyle>;
};

function QuestionVisualAsset({
  uri,
  alt,
  caption,
  style,
  containerStyle,
}: QuestionVisualAssetProps) {
  const { height, width } = useWindowDimensions();
  const [viewerVisible, setViewerVisible] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1);
  const scale = useSharedValue(1);
  const startingScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const startingX = useSharedValue(0);
  const startingY = useSharedValue(0);
  const inlineHeight = Math.max(176, Math.min(280, width * 0.58));
  const viewerWidth = Math.max(1, width - spacing[8]);
  const viewerImageHeight = Math.max(
    220,
    Math.min(height - 220, viewerWidth / (16 / 9)),
  );

  const resetZoom = useCallback(() => {
    scale.value = withTiming(1);
    translateX.value = withTiming(0);
    translateY.value = withTiming(0);
    setZoomLevel(1);
  }, [scale, translateX, translateY]);

  const changeZoom = useCallback(
    (next: number) => {
      const clamped = Math.max(1, Math.min(4, next));
      scale.value = withTiming(clamped);
      if (clamped === 1) {
        translateX.value = withTiming(0);
        translateY.value = withTiming(0);
      }
      setZoomLevel(clamped);
    },
    [scale, translateX, translateY],
  );

  const closeViewer = useCallback(() => {
    setViewerVisible(false);
    resetZoom();
  }, [resetZoom]);

  const pinchGesture = useMemo(
    () =>
      Gesture.Pinch()
        .onBegin(() => {
          startingScale.value = scale.value;
        })
        .onUpdate((event) => {
          scale.value = Math.max(
            1,
            Math.min(4, startingScale.value * event.scale),
          );
        })
        .onEnd(() => {
          runOnJS(setZoomLevel)(Math.round(scale.value * 10) / 10);
          if (scale.value <= 1.01) {
            translateX.value = withTiming(0);
            translateY.value = withTiming(0);
          }
        }),
    [scale, startingScale, translateX, translateY],
  );

  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .onBegin(() => {
          startingX.value = translateX.value;
          startingY.value = translateY.value;
        })
        .onUpdate((event) => {
          if (scale.value <= 1) return;
          const limit = (scale.value - 1) * 160;
          translateX.value = Math.max(
            -limit,
            Math.min(limit, startingX.value + event.translationX),
          );
          translateY.value = Math.max(
            -limit,
            Math.min(limit, startingY.value + event.translationY),
          );
        }),
    [scale, startingX, startingY, translateX, translateY],
  );

  const viewerGesture = useMemo(
    () => Gesture.Simultaneous(pinchGesture, panGesture),
    [panGesture, pinchGesture],
  );
  const animatedImageStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  return (
    <View style={containerStyle}>
      <View style={styles.frame}>
        <ProtectedContentImage
          uri={uri}
          accessibilityLabel={alt}
          contentHeight={inlineHeight}
          errorHeight={144}
          style={[styles.image, style]}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Open ${alt} full screen`}
          accessibilityHint="Opens a viewer where you can zoom and move around the figure."
          onPress={() => {
            resetZoom();
            setViewerVisible(true);
          }}
          hitSlop={8}
          style={styles.expandButton}
        >
          <Ionicons name="expand-outline" size={18} color={colors.white} />
        </Pressable>
      </View>
      {caption ? <Text style={styles.caption}>{caption}</Text> : null}

      <Modal
        visible={viewerVisible}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={closeViewer}
      >
        <GestureHandlerRootView style={styles.viewerBackdrop}>
          <View style={styles.viewerHeader}>
            <View style={styles.viewerTitleGroup}>
              <Text style={styles.viewerKicker}>Question figure</Text>
              <Text style={styles.viewerTitle}>
                Pinch or use the controls to inspect details.
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close figure viewer"
              onPress={closeViewer}
              style={styles.viewerClose}
            >
              <Ionicons name="close" size={22} color={colors.white} />
            </Pressable>
          </View>

          <View style={styles.viewerCanvas}>
            <GestureDetector gesture={viewerGesture}>
              <Animated.View
                style={[styles.viewerFigure, animatedImageStyle]}
              >
                <ProtectedContentImage
                  uri={uri}
                  accessibilityLabel={alt}
                  contentHeight={viewerImageHeight}
                  errorHeight={144}
                  style={styles.viewerImage}
                />
              </Animated.View>
            </GestureDetector>
          </View>

          {caption ? (
            <Text numberOfLines={2} style={styles.viewerCaption}>
              {caption}
            </Text>
          ) : null}
          <View style={styles.viewerControls}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Zoom out"
              accessibilityState={{ disabled: zoomLevel <= 1 }}
              disabled={zoomLevel <= 1}
              onPress={() => changeZoom(zoomLevel - 0.5)}
              style={[
                styles.viewerControl,
                zoomLevel <= 1 && styles.viewerControlDisabled,
              ]}
            >
              <Ionicons name="remove" size={21} color={colors.white} />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Reset zoom"
              onPress={resetZoom}
              style={styles.viewerReset}
            >
              <Text style={styles.viewerResetText}>
                {Math.round(zoomLevel * 100)}%
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Zoom in"
              accessibilityState={{ disabled: zoomLevel >= 4 }}
              disabled={zoomLevel >= 4}
              onPress={() => changeZoom(zoomLevel + 0.5)}
              style={[
                styles.viewerControl,
                zoomLevel >= 4 && styles.viewerControlDisabled,
              ]}
            >
              <Ionicons name="add" size={21} color={colors.white} />
            </Pressable>
          </View>
        </GestureHandlerRootView>
      </Modal>
    </View>
  );
}

export function QuestionVisual({
  visual,
  style,
  containerStyle,
}: QuestionVisualProps) {
  const { width } = useWindowDimensions();
  const assets = useMemo(
    () =>
      getQuestionVisualAssetUrls(visual)
        .map((uri) => resolveQuestionVisualUrl(uri, API_BASE_URL))
        .filter((uri): uri is string => Boolean(uri)),
    [visual],
  );

  if (assets.length === 0) return null;

  const useColumns = assets.length > 1 && width >= 600;
  return (
    <View
      style={[
        styles.gallery,
        useColumns && styles.galleryColumns,
        containerStyle,
      ]}
    >
      {assets.map((uri, index) => (
        <QuestionVisualAsset
          key={uri}
          uri={uri}
          alt={
            visual.captions?.[index] ||
            visual.alt_text ||
            "Question reference visual"
          }
          caption={visual.captions?.[index]}
          style={style}
          containerStyle={useColumns ? styles.galleryColumn : undefined}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  gallery: {
    width: "100%",
    gap: spacing[3],
  },
  galleryColumns: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  galleryColumn: {
    width: "48%",
    flexGrow: 1,
  },
  frame: {
    width: "100%",
    overflow: "hidden",
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.white,
  },
  image: {
    width: "100%",
  },
  expandButton: {
    position: "absolute",
    right: spacing[2],
    bottom: spacing[2],
    width: 42,
    height: 42,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(7, 21, 45, 0.88)",
  },
  caption: {
    marginTop: spacing[1],
    color: colors.textMuted,
    fontFamily: typography.fonts.body,
    fontSize: 11,
    lineHeight: 16,
  },
  viewerBackdrop: {
    flex: 1,
    paddingTop: spacing[8],
    paddingBottom: spacing[6],
    paddingHorizontal: spacing[4],
    backgroundColor: "rgba(4, 12, 28, 0.98)",
  },
  viewerHeader: {
    minHeight: 68,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[3],
  },
  viewerTitleGroup: {
    flex: 1,
  },
  viewerKicker: {
    color: colors.accent,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 10,
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  viewerTitle: {
    marginTop: spacing[1],
    color: colors.white,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 13,
    lineHeight: 19,
  },
  viewerClose: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255, 255, 255, 0.12)",
  },
  viewerCanvas: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  viewerFigure: {
    width: "100%",
  },
  viewerImage: {
    backgroundColor: colors.white,
  },
  viewerCaption: {
    marginBottom: spacing[3],
    color: "rgba(255, 255, 255, 0.72)",
    fontFamily: typography.fonts.body,
    fontSize: 11,
    lineHeight: 16,
    textAlign: "center",
  },
  viewerControls: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing[3],
  },
  viewerControl: {
    width: 48,
    height: 48,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255, 255, 255, 0.14)",
  },
  viewerControlDisabled: {
    opacity: 0.35,
  },
  viewerReset: {
    minWidth: 78,
    height: 48,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accentStrong,
  },
  viewerResetText: {
    color: colors.white,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 12,
  },
});
