import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
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
import { API_BASE_URL } from "../../api/client";
import { colors, radius, spacing, typography } from "../../theme";
import type { QuestionVisualPayload } from "../../types";
import {
  getQuestionVisualAssetUrls,
  resolveQuestionVisualUrl,
} from "../../utils/questionVisual";

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
  const [aspectRatio, setAspectRatio] = useState(16 / 9);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    let active = true;
    Image.getSize(
      uri,
      (width, height) => {
        if (active && width > 0 && height > 0) setAspectRatio(width / height);
      },
      () => undefined,
    );
    return () => {
      active = false;
    };
  }, [uri, retryKey]);

  if (failed) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Retry question image"
        onPress={() => {
          setFailed(false);
          setLoaded(false);
          setRetryKey((current) => current + 1);
        }}
        style={[styles.state, containerStyle]}
      >
        <Ionicons name="image-outline" size={20} color={colors.textMuted} />
        <Text style={styles.stateTitle}>Question image unavailable</Text>
        <Text style={styles.stateAction}>Tap to retry</Text>
      </Pressable>
    );
  }

  return (
    <View style={containerStyle}>
      <View style={styles.frame}>
        {!loaded ? (
          <View
            accessibilityLabel="Loading question image"
            style={styles.loadingState}
          >
            <ActivityIndicator color={colors.accent} />
          </View>
        ) : null}
        <Image
          key={`${uri}-${retryKey}`}
          source={{ uri }}
          accessibilityLabel={alt}
          resizeMode="contain"
          onError={() => setFailed(true)}
          onLoad={({ nativeEvent }) => {
            const width = nativeEvent.source?.width;
            const height = nativeEvent.source?.height;
            if (width && height) setAspectRatio(width / height);
            setLoaded(true);
          }}
          style={[
            styles.image,
            { aspectRatio, opacity: loaded ? 1 : 0 },
            style,
          ]}
        />
      </View>
      {caption ? <Text style={styles.caption}>{caption}</Text> : null}
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
  loadingState: {
    ...StyleSheet.absoluteFillObject,
    minHeight: 120,
    alignItems: "center",
    justifyContent: "center",
  },
  image: {
    width: "100%",
    maxHeight: 360,
  },
  state: {
    width: "100%",
    minHeight: 144,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing[2],
    padding: spacing[4],
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.backgroundMuted,
  },
  stateTitle: {
    color: colors.textMuted,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 12,
    textAlign: "center",
  },
  stateAction: {
    color: colors.accentStrong,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 11,
  },
  caption: {
    marginTop: spacing[1],
    color: colors.textMuted,
    fontFamily: typography.fonts.body,
    fontSize: 11,
    lineHeight: 16,
  },
});
