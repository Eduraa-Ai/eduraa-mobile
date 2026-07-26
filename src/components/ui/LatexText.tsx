import React from "react";
import {
  Platform,
  StyleSheet,
  Text,
  ScrollView,
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
  displayMathScrollable?: boolean;
  preserveOuterWhitespace?: boolean;
  promoteComplexInlineMath?: boolean;
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
  displayMathScrollable,
  preserveOuterWhitespace,
  promoteComplexInlineMath,
}: LatexTextProps) {
  const rawValue = value == null ? "" : String(value);
  const normalizedCore = normalizeLatexContent(rawValue);
  const normalized = normalizedCore;
  const boundarySpacing: ViewStyle | undefined = preserveOuterWhitespace
    ? {
        marginLeft: /^\s/.test(rawValue) ? 3 : 0,
        marginRight: /\s$/.test(rawValue) ? 3 : 0,
      }
    : undefined;
  const flattenedTextStyle = StyleSheet.flatten(style) ?? {};

  if (!containsLatex(normalized)) {
    return (
      <View style={[styles.container, boundarySpacing, containerStyle]}>
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
      style={[styles.container, boundarySpacing, containerStyle]}
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

            const promoteInline =
              promoteComplexInlineMath &&
              segment.kind === "inline-math" &&
              /\\(?:d?frac|begin|int|lim|prod|sum)\b/.test(segment.value) &&
              segment.value.length > 24;
            const isDisplay =
              segment.kind === "display-math" || Boolean(promoteInline);
            const renderedFontSize = isDisplay ? fontSize + 2 : fontSize;
            const renderedMathValue = promoteInline
              ? segment.value.startsWith("$")
                ? `\\[${segment.value.slice(1, -1)}\\]`
                : `\\[${segment.value.slice(2, -2)}\\]`
              : segment.value;
            const webFontStyle =
              Platform.OS === "web"
                ? ({ fontSize: renderedFontSize } as unknown as ViewStyle)
                : {};
            const mathStyle: ViewStyle = {
              ...styles.math,
              ...webFontStyle,
              ...(isDisplay ? styles.displayMath : {}),
            };
            const math = (
              <MathJaxSvg
                color={color}
                fontCache
                fontSize={Platform.OS === "web" ? 2.25 : renderedFontSize}
                style={mathStyle}
                textStyle={mathTextStyle}
              >
                {escapeMathJaxHtml(renderedMathValue)}
              </MathJaxSvg>
            );

            return isDisplay && displayMathScrollable ? (
              <ScrollView
                key={`${segment.kind}-${index}`}
                horizontal
                nestedScrollEnabled
                showsHorizontalScrollIndicator={false}
                style={styles.displayScroll}
                contentContainerStyle={styles.displayScrollContent}
              >
                {math}
              </ScrollView>
            ) : (
              <React.Fragment key={`${segment.kind}-${index}`}>
                {math}
              </React.Fragment>
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
  displayScroll: {
    width: "100%",
    maxWidth: "100%",
  },
  displayScrollContent: {
    minWidth: "100%",
    justifyContent: "center",
  },
});
