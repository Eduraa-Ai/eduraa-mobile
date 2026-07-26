import React, { useMemo } from "react";
import {
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import Markdown, {
  type ASTNode,
  type RenderRules,
} from "react-native-markdown-display";
import { LatexText } from "../ui";
import {
  prepareAIResponseContent,
  restoreAIResponseMath,
} from "../../utils/aiResponseContent";
import { colors } from "../../theme/colors";
import { fonts } from "../../theme/fonts";
import { radius, spacing } from "../../theme/spacing";

interface AIResponseRendererProps {
  content?: string | null;
  textStyle?: StyleProp<TextStyle>;
  containerStyle?: StyleProp<ViewStyle>;
}

function trimTrailingNewline(value: string) {
  return value.endsWith("\n") ? value.slice(0, -1) : value;
}

function sourceInfo(node: ASTNode) {
  return (node as ASTNode & { sourceInfo?: string }).sourceInfo;
}

function inlineFlow(key: string, children: React.ReactNode) {
  return (
    <View key={key} style={styles.inlineFlow}>
      {children}
    </View>
  );
}

export const AIResponseRenderer = React.memo(function AIResponseRenderer({
  content,
  textStyle,
  containerStyle,
}: AIResponseRendererProps) {
  const prepared = useMemo(
    () => prepareAIResponseContent(content),
    [content],
  );

  const rules = useMemo<RenderRules>(
    () => ({
      text: (node, _children, _parents, markdownStyles, inheritedStyles) => (
        <LatexText
          key={node.key}
          value={restoreAIResponseMath(node.content, prepared.math)}
          style={[markdownStyles.text, inheritedStyles, textStyle]}
          containerStyle={styles.textContainer}
          selectable
          displayMathScrollable
          preserveOuterWhitespace
          promoteComplexInlineMath
        />
      ),
      textgroup: (node, children) => inlineFlow(node.key, children),
      strong: (node, children) => inlineFlow(node.key, children),
      em: (node, children) => inlineFlow(node.key, children),
      s: (node, children) => inlineFlow(node.key, children),
      inline: (node, children) => inlineFlow(node.key, children),
      span: (node, children) => inlineFlow(node.key, children),
      link: (
        node: ASTNode,
        children,
        _parents,
        markdownStyles,
        onLinkPress,
      ) => {
        const href = node.attributes.href;
        return (
          <TouchableOpacity
            key={node.key}
            style={styles.inlineLink}
            activeOpacity={0.72}
            accessibilityRole="link"
            accessibilityLabel={href}
            onPress={() => {
              const shouldOpen = onLinkPress ? onLinkPress(href) : true;
              if (href && shouldOpen) {
                void Linking.openURL(href);
              }
            }}
          >
            <View style={[styles.inlineFlow, markdownStyles.link]}>
              {children}
            </View>
          </TouchableOpacity>
        );
      },
      fence: (node, _children, _parents, markdownStyles, inheritedStyles) => (
        <View key={node.key} style={styles.codeCard}>
          {sourceInfo(node) ? (
            <Text style={styles.codeLanguage}>
              {String(sourceInfo(node)).trim().toUpperCase()}
            </Text>
          ) : null}
          <ScrollView
            horizontal
            nestedScrollEnabled
            showsHorizontalScrollIndicator
            contentContainerStyle={styles.codeScrollContent}
            accessibilityLabel={
              sourceInfo(node)
                ? `${String(sourceInfo(node)).trim()} code block`
                : "Code block"
            }
          >
            <Text
              selectable
              style={[inheritedStyles, markdownStyles.fence, styles.codeText]}
            >
              {trimTrailingNewline(node.content)}
            </Text>
          </ScrollView>
        </View>
      ),
      code_block: (
        node,
        _children,
        _parents,
        markdownStyles,
        inheritedStyles,
      ) => (
        <ScrollView
          key={node.key}
          horizontal
          nestedScrollEnabled
          showsHorizontalScrollIndicator
          style={styles.codeCard}
          contentContainerStyle={styles.codeScrollContent}
          accessibilityLabel="Code block"
        >
          <Text
            selectable
            style={[inheritedStyles, markdownStyles.code_block, styles.codeText]}
          >
            {trimTrailingNewline(node.content)}
          </Text>
        </ScrollView>
      ),
      table: (node, children, _parents, markdownStyles) => (
        <View key={node.key} style={styles.tableFrame}>
          <Text style={styles.tableHint}>Swipe to see all columns ↔</Text>
          <ScrollView
            horizontal
            nestedScrollEnabled
            showsHorizontalScrollIndicator
            style={styles.tableScroll}
            contentContainerStyle={styles.tableScrollContent}
            accessibilityLabel="Scrollable comparison table"
          >
            <View style={markdownStyles._VIEW_SAFE_table}>{children}</View>
          </ScrollView>
        </View>
      ),
    }),
    [prepared.math, textStyle],
  );

  if (!prepared.markdown.trim()) return null;

  return (
    <View style={[styles.root, containerStyle]}>
      <Markdown rules={rules} style={markdownStyles}>
        {prepared.markdown}
      </Markdown>
    </View>
  );
});

const styles = StyleSheet.create({
  root: {
    width: "100%",
    minWidth: 0,
    flexShrink: 1,
  },
  textContainer: {
    flexShrink: 1,
    minWidth: 0,
  },
  inlineFlow: {
    minWidth: 0,
    flexShrink: 1,
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
  },
  inlineLink: {
    flexShrink: 1,
  },
  codeCard: {
    width: "100%",
    maxWidth: "100%",
    marginBottom: spacing[3],
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#D7DFEA",
    backgroundColor: "#F7F9FC",
    overflow: "hidden",
  },
  codeLanguage: {
    paddingHorizontal: spacing[3],
    paddingTop: spacing[2],
    color: colors.muted,
    fontSize: 10,
    letterSpacing: 0.8,
    fontFamily: fonts.bold,
  },
  codeScrollContent: {
    minWidth: "100%",
  },
  codeText: {
    minWidth: "100%",
    padding: spacing[3],
    backgroundColor: "transparent",
    borderWidth: 0,
    borderLeftWidth: 0,
    fontFamily: Platform.select({
      ios: "Menlo",
      android: "monospace",
      default: "monospace",
    }),
  },
  tableFrame: {
    width: "100%",
    maxWidth: "100%",
    marginBottom: spacing[3],
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    overflow: "hidden",
    backgroundColor: colors.card,
  },
  tableHint: {
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[1],
    color: colors.muted,
    fontSize: 10,
    letterSpacing: 0.2,
    fontFamily: fonts.semibold,
    textAlign: "right",
    backgroundColor: "#F7F9FC",
  },
  tableScroll: {
    width: "100%",
    maxWidth: "100%",
  },
  tableScrollContent: {
    minWidth: "100%",
  },
});

const markdownStyles = StyleSheet.create({
  body: {
    color: colors.ink,
    fontSize: 14,
    lineHeight: 22,
    fontFamily: fonts.regular,
  },
  text: {
    color: colors.ink,
    fontSize: 14,
    lineHeight: 22,
    fontFamily: fonts.regular,
  },
  heading1: {
    color: "#07152D",
    fontSize: 22,
    lineHeight: 28,
    fontFamily: fonts.displayBold,
    marginTop: spacing[2],
    marginBottom: spacing[2],
  },
  heading2: {
    color: "#07152D",
    fontSize: 19,
    lineHeight: 25,
    fontFamily: fonts.displaySemibold,
    marginTop: spacing[3],
    marginBottom: spacing[2],
  },
  heading3: {
    color: "#07152D",
    fontSize: 17,
    lineHeight: 23,
    fontFamily: fonts.displaySemibold,
    marginTop: spacing[2],
    marginBottom: spacing[1],
  },
  heading4: {
    color: "#07152D",
    fontSize: 16,
    lineHeight: 22,
    fontFamily: fonts.displaySemibold,
    marginTop: spacing[3],
    marginBottom: spacing[1],
  },
  heading5: {
    color: "#07152D",
    fontSize: 15,
    lineHeight: 21,
    fontFamily: fonts.bold,
    marginTop: spacing[2],
    marginBottom: spacing[1],
  },
  heading6: {
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: fonts.bold,
    marginTop: spacing[2],
    marginBottom: spacing[1],
  },
  hr: {
    height: StyleSheet.hairlineWidth,
    marginTop: spacing[3],
    marginBottom: spacing[3],
    backgroundColor: colors.border,
  },
  paragraph: { marginTop: 0, marginBottom: spacing[2] },
  strong: { color: "#07152D", fontFamily: fonts.bold },
  em: { color: colors.textSecondary, fontFamily: fonts.medium },
  bullet_list: { marginBottom: spacing[2] },
  ordered_list: { marginBottom: spacing[2] },
  list_item: { marginBottom: spacing[1] },
  code_inline: {
    color: "#07152D",
    backgroundColor: "#FFF0E5",
    borderColor: "#F7CBAF",
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[1],
    fontFamily: fonts.semibold,
  },
  code_block: {
    color: "#07152D",
    backgroundColor: "transparent",
    fontFamily: fonts.medium,
  },
  fence: {
    color: "#07152D",
    backgroundColor: "transparent",
    fontFamily: fonts.medium,
  },
  blockquote: {
    backgroundColor: "#FFF8EE",
    borderLeftColor: colors.accent,
    borderLeftWidth: 3,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
  },
  link: { color: colors.accentStrong },
  table: {
    borderWidth: 0,
  },
  thead: {
    backgroundColor: "#F7F9FC",
  },
  tr: {
    flexDirection: "row",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  th: {
    minWidth: 132,
    flex: 1,
    padding: spacing[2],
    borderRightWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  td: {
    minWidth: 132,
    flex: 1,
    padding: spacing[2],
    borderRightWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
});
