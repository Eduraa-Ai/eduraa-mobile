import React from "react";
import {
  Platform,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { MathJaxSvg } from "react-native-mathjax-html-to-svg";
import {
  containsLatex,
  escapeMathJaxHtml,
  latexToPlainText,
  normalizeLatexContent,
  splitLatexContent,
} from "../../utils/latex";

type LatexTextProps = {
  value?: string | null;
  style?: StyleProp<TextStyle>;
  containerStyle?: StyleProp<ViewStyle>;
  selectable?: boolean;
};

class LatexRenderBoundary extends React.Component<
  React.PropsWithChildren<{ fallback: React.ReactNode }>,
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export function LatexText({
  value,
  style,
  containerStyle,
  selectable,
}: LatexTextProps) {
  const normalized = normalizeLatexContent(value);
  const flattenedTextStyle = StyleSheet.flatten(style) ?? {};

  if (!containsLatex(normalized)) {
    return (
      <View style={[styles.container, containerStyle]}>
        <Text style={style} selectable={selectable}>
          {normalized}
        </Text>
      </View>
    );
  }

  const fontSize =
    typeof flattenedTextStyle.fontSize === "number"
      ? flattenedTextStyle.fontSize
      : 14;
  const color =
    typeof flattenedTextStyle.color === "string"
      ? flattenedTextStyle.color
      : "#101828";
  const fallback = (
    <Text style={style} selectable={selectable}>
      {latexToPlainText(normalized)}
    </Text>
  );
  const { fontSize: _fontSize, ...mathTextStyle } = flattenedTextStyle;
  const segments = splitLatexContent(normalized);

  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={latexToPlainText(normalized)}
      style={[styles.container, containerStyle]}
    >
      <LatexRenderBoundary key={normalized} fallback={fallback}>
        <View style={styles.flow}>
          {segments.map((segment, index) => {
            if (segment.kind === "text") {
              return (
                <Text
                  key={`${segment.kind}-${index}`}
                  style={[style, styles.prose]}
                  selectable={selectable}
                >
                  {segment.value.replace(/\s*\n\s*/g, " ")}
                </Text>
              );
            }

            const isDisplay = segment.kind === "display-math";
            const webFontStyle =
              Platform.OS === "web"
                ? ({ fontSize } as unknown as ViewStyle)
                : {};
            const mathStyle: ViewStyle = {
              ...styles.math,
              ...webFontStyle,
              ...(isDisplay ? styles.displayMath : {}),
            };
            return (
              <MathJaxSvg
                key={`${segment.kind}-${index}`}
                color={color}
                fontCache
                fontSize={Platform.OS === "web" ? 2 : fontSize}
                style={mathStyle}
                textStyle={mathTextStyle}
              >
                {escapeMathJaxHtml(segment.value)}
              </MathJaxSvg>
            );
          })}
        </View>
      </LatexRenderBoundary>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexShrink: 1,
  },
  flow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
  },
  prose: {
    flexShrink: 1,
  },
  math: {
    alignSelf: "center",
  },
  displayMath: {
    width: "100%",
    justifyContent: "center",
  },
});
