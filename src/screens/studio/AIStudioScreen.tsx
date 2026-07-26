import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import {
  View,
  Text,
  TextInput,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Animated,
  useWindowDimensions,
  Modal,
  ScrollView,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import {
  useNavigation,
  useNavigationState,
  type NavigationProp,
  type ParamListBase,
} from "@react-navigation/native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Clipboard from "expo-clipboard";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { colors } from "../../theme/colors";
import { spacing, radius, shadows } from "../../theme/spacing";
import { fonts } from "../../theme/fonts";
import { aiApi } from "../../api/ai";
import { papersApi } from "../../api/papers";
import type {
  ChatConversation,
  ChatMessage,
  PaperListItem,
  UserMemoryItem,
} from "../../types";
import { AuthLogoMark } from "../../components/ui";
import { AIResponseRenderer } from "../../components/ai/AIResponseRenderer";
import { useAuth } from "../../hooks/useAuth";

// ─── Types ────────────────────────────────────────────────────────────────────

interface LocalMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  pending?: boolean;
}

interface FailedRequest {
  content: string;
  message: string;
  partialMessageId?: string;
}

interface ConversationLoadFailure {
  conversation: ChatConversation;
  message: string;
}

interface LocalAttachment {
  id: string;
  name: string;
  uri: string;
  mimeType?: string | null;
  size?: number | null;
  source: "document" | "camera" | "gallery";
}

interface ContextRow {
  status: string;
  label: string;
  value: string;
}

const WELCOME_MESSAGE: LocalMessage = {
  id: "__welcome__",
  role: "assistant",
  content:
    "Hi! I'm Eduraa AI — your personal study tutor. Ask me anything about your subjects, get explanations, or challenge yourself with questions.",
  timestamp: new Date(),
};

const STARTERS = [
  {
    prompt: "Explain my weakest Physics concept",
    intent: "Understand",
    icon: "bulb-outline" as const,
  },
  {
    prompt: "Analyze my latest mock test",
    intent: "Reflect",
    icon: "analytics-outline" as const,
  },
  {
    prompt: "Create a targeted practice paper",
    intent: "Practice",
    icon: "document-text-outline" as const,
  },
  {
    prompt: "Plan my study week",
    intent: "Plan",
    icon: "calendar-clear-outline" as const,
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const diff = now - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
  });
}

function msgTime(date: Date): string {
  return date.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

// ─── Typing dots ──────────────────────────────────────────────────────────────

function TypingDots() {
  const anims = [
    useRef(new Animated.Value(0)).current,
    useRef(new Animated.Value(0)).current,
    useRef(new Animated.Value(0)).current,
  ];

  useEffect(() => {
    const loops = anims.map((a, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 140),
          Animated.timing(a, {
            toValue: -5,
            duration: 280,
            useNativeDriver: true,
          }),
          Animated.timing(a, {
            toValue: 0,
            duration: 280,
            useNativeDriver: true,
          }),
          Animated.delay(560),
        ]),
      ),
    );
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <View style={td.row}>
      <View style={td.avatar}>
        <Ionicons name="sparkles" size={13} color={colors.white} />
      </View>
      <View style={[td.bubble, shadows.xs]}>
        {anims.map((a, i) => (
          <Animated.View
            key={i}
            style={[td.dot, { transform: [{ translateY: a }] }]}
          />
        ))}
      </View>
    </View>
  );
}

const td = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: spacing[2],
    paddingHorizontal: spacing[4],
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 9,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  bubble: {
    flexDirection: "row",
    gap: 5,
    alignItems: "center",
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    borderBottomLeftRadius: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
  },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.subtle },
});

// ─── Structured response renderer ────────────────────────────────────────────

interface AIBlock {
  type: string;
  role?: string;
  content?: string;
  intent?: string;
}

interface AIStructuredResponse {
  type: string;
  blocks: AIBlock[];
}

function parseAIContent(content: string): AIStructuredResponse | null {
  try {
    const parsed = JSON.parse(content);
    if (parsed?.type && Array.isArray(parsed?.blocks)) return parsed;
    return null;
  } catch {
    return null;
  }
}

function AIBlocks({ blocks }: { blocks: AIBlock[] }) {
  return (
    <View style={{ gap: spacing[2] }}>
      {blocks.map((block, i) => {
        if (block.type === "text") {
          const isPrimary = block.role === "primary";
          return (
            <AIResponseRenderer
              key={i}
              content={block.content}
              textStyle={
                isPrimary
                  ? [mb.aiText, mb.blockPrimary]
                  : [mb.aiText, mb.blockSecondary]
              }
            />
          );
        }
        if (block.type === "callout") {
          const isWarning = block.intent === "warning";
          const isTip = block.intent === "tip";
          return (
            <View
              key={i}
              style={[
                mb.callout,
                isWarning && mb.calloutWarning,
                isTip && mb.calloutTip,
              ]}
            >
              <Ionicons
                name={isWarning ? "warning-outline" : "bulb-outline"}
                size={13}
                color={isWarning ? colors.warning : colors.accent}
                style={{ marginTop: 1, flexShrink: 0 }}
              />
              <AIResponseRenderer
                content={block.content}
                containerStyle={mb.calloutContent}
                textStyle={[
                  mb.calloutText,
                  isWarning && mb.calloutTextWarning,
                ]}
              />
            </View>
          );
        }
        // fallback for unknown block types
        return block.content ? (
          <AIResponseRenderer
            key={i}
            content={block.content}
            textStyle={mb.aiText}
          />
        ) : null;
      })}
    </View>
  );
}

// ─── Message bubble ───────────────────────────────────────────────────────────

const MessageBubble = React.memo(function MessageBubble({
  msg,
  showActions,
  onCopy,
  onRegenerate,
  onMakeQuestions,
}: {
  msg: LocalMessage;
  showActions: boolean;
  onCopy: (message: LocalMessage) => void;
  onRegenerate: () => void;
  onMakeQuestions: () => void;
}) {
  const isUser = msg.role === "user";
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(10)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 220,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 220,
        useNativeDriver: true,
      }),
    ]).start();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const structured = !isUser ? parseAIContent(msg.content) : null;

  return (
    <Animated.View
      style={[
        mb.row,
        isUser ? mb.userRow : mb.aiRow,
        { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
      ]}
    >
      {!isUser && (
        <View style={mb.aiAvatar}>
          <AuthLogoMark size={30} style={mb.aiLogo} />
        </View>
      )}
      <View style={[mb.bubble, isUser ? mb.userBubble : mb.aiBubble]}>
        {!isUser ? <Text style={mb.aiName}>Eduraa · Step by step</Text> : null}
        {structured ? (
          <AIBlocks blocks={structured.blocks} />
        ) : isUser ? (
          <Text style={[mb.text, mb.userText]}>{msg.content}</Text>
        ) : (
          <AIResponseRenderer content={msg.content} />
        )}
        {msg.pending ? <View style={mb.streamingCursor} /> : null}
        <Text style={[mb.time, isUser ? mb.userTime : mb.aiTime]}>
          {msgTime(msg.timestamp)}
        </Text>
        {!isUser && showActions && !msg.pending ? (
          <View style={mb.actions}>
            <TouchableOpacity
              style={mb.action}
              onPress={() => onCopy(msg)}
              accessibilityLabel="Copy response"
            >
              <Ionicons name="copy-outline" size={15} color={colors.muted} />
              <Text style={mb.actionText}>Copy</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={mb.action}
              onPress={onRegenerate}
              accessibilityLabel="Regenerate response"
            >
              <Ionicons name="refresh-outline" size={15} color={colors.muted} />
              <Text style={mb.actionText}>Rewrite</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[mb.action, mb.actionPrimary]}
              onPress={onMakeQuestions}
              accessibilityLabel="Make practice questions"
            >
              <Ionicons
                name="document-text-outline"
                size={15}
                color={colors.accentStrong}
              />
              <Text style={mb.actionPrimaryText}>Make questions</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </View>
    </Animated.View>
  );
});

const mb = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "flex-end", gap: spacing[2] },
  userRow: { justifyContent: "flex-end" },
  aiRow: { justifyContent: "flex-start" },
  aiAvatar: {
    width: 30,
    height: 30,
    flexShrink: 0,
    alignSelf: "flex-start",
    marginTop: 1,
  },
  aiLogo: { borderWidth: 0, shadowOpacity: 0, elevation: 0 },
  bubble: {
    maxWidth: "82%",
    borderRadius: radius.xl,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    gap: 4,
  },
  userBubble: { backgroundColor: "#07152D", borderBottomRightRadius: 5 },
  aiBubble: {
    maxWidth: "100%",
    flex: 1,
    paddingHorizontal: 0,
    paddingTop: 0,
    paddingBottom: spacing[2],
    borderRadius: 0,
    backgroundColor: "transparent",
    shadowOpacity: 0,
    elevation: 0,
  },
  text: { fontSize: 14, lineHeight: 22, fontFamily: fonts.regular },
  userText: { color: colors.white },
  aiText: {
    color: colors.ink,
    fontSize: 14,
    lineHeight: 22,
    fontFamily: fonts.regular,
  },
  aiName: {
    color: colors.accentStrong,
    fontSize: 10,
    fontFamily: fonts.bold,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: spacing[1],
  },
  blockPrimary: {
    fontSize: 14,
    lineHeight: 22,
    fontWeight: "500",
    fontFamily: fonts.medium,
  },
  blockSecondary: {
    fontSize: 13,
    lineHeight: 20,
    fontFamily: fonts.regular,
    color: colors.muted,
  },
  callout: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing[2],
    backgroundColor: colors.accentLight,
    borderRadius: radius.lg,
    padding: spacing[3],
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.accentMid,
  },
  calloutWarning: {
    backgroundColor: colors.warningBg,
    borderColor: colors.warningBorder,
  },
  calloutTip: {
    backgroundColor: colors.accentLight,
    borderColor: colors.accentMid,
  },
  calloutText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
    color: colors.accentStrong,
  },
  calloutTextWarning: { color: colors.warningText },
  calloutContent: { flex: 1, width: "auto" },
  time: { fontSize: 10 },
  userTime: { color: "rgba(255,255,255,0.55)", textAlign: "right" },
  aiTime: { color: colors.subtle },
  streamingCursor: {
    width: 7,
    height: 16,
    marginTop: 2,
    borderRadius: 2,
    backgroundColor: colors.accent,
  },
  actions: {
    marginTop: spacing[2],
    paddingTop: spacing[2],
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: spacing[1],
  },
  action: {
    minHeight: 40,
    paddingHorizontal: spacing[2],
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[1],
  },
  actionText: { color: colors.muted, fontSize: 11, fontFamily: fonts.semibold },
  actionPrimary: {
    paddingHorizontal: spacing[3],
    borderRadius: radius.full,
    backgroundColor: colors.accentMid,
  },
  actionPrimaryText: {
    color: colors.accentStrong,
    fontSize: 11,
    fontFamily: fonts.bold,
  },
});

function CalmStart({ onChoose }: { onChoose: (prompt: string) => void }) {
  return (
    <View style={calm.root}>
      <View style={calm.identity}>
        <AuthLogoMark size={42} style={calm.logo} />
        <View style={calm.identityCopy}>
          <Text style={calm.eyebrow}>EDURAA INTELLIGENCE</Text>
          <Text style={calm.ready}>Ready with your learning context</Text>
        </View>
      </View>
      <Text style={calm.title}>What would you like to understand?</Text>
      <Text style={calm.body}>
        Ask naturally. Explain a doubt, inspect a score, build practice, or
        shape a realistic plan.
      </Text>

      <View style={calm.promptRail}>
        {STARTERS.map((starter, index) => (
          <TouchableOpacity
            key={starter.prompt}
            style={[
              calm.prompt,
              index < STARTERS.length - 1 && calm.promptDivider,
            ]}
            onPress={() => onChoose(starter.prompt)}
            activeOpacity={0.72}
            accessibilityLabel={`${starter.intent}: ${starter.prompt}`}
          >
            <View style={calm.promptIcon}>
              <Ionicons name={starter.icon} size={18} color={colors.accent} />
            </View>
            <View style={calm.promptCopy}>
              <Text style={calm.promptIntent}>{starter.intent}</Text>
              <Text style={calm.promptText}>{starter.prompt}</Text>
            </View>
            <Ionicons name="arrow-forward" size={17} color={colors.accent} />
          </TouchableOpacity>
        ))}
      </View>

      <View style={calm.trustLine}>
        <Ionicons
          name="shield-checkmark-outline"
          size={15}
          color={colors.success}
        />
        <Text style={calm.trustText}>
          Uses confirmed Eduraa context. You stay in control of what is
          attached.
        </Text>
      </View>
    </View>
  );
}

const calm = StyleSheet.create({
  root: {
    flex: 1,
    paddingHorizontal: spacing[5],
    paddingTop: spacing[4],
    paddingBottom: spacing[3],
  },
  identity: { flexDirection: "row", alignItems: "center", gap: spacing[3] },
  logo: {
    borderWidth: 0,
    shadowOpacity: 0,
    elevation: 0,
    backgroundColor: "transparent",
  },
  identityCopy: { flex: 1 },
  eyebrow: {
    color: colors.accentStrong,
    fontSize: 9,
    fontFamily: fonts.extrabold,
    letterSpacing: 1.2,
  },
  ready: {
    color: colors.textSecondary,
    fontSize: 11,
    fontFamily: fonts.medium,
    marginTop: 2,
  },
  title: {
    color: "#07152D",
    fontSize: 28,
    lineHeight: 32,
    fontFamily: fonts.displaySemibold,
    marginTop: spacing[4],
  },
  body: {
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
    fontFamily: fonts.regular,
    marginTop: spacing[1],
    maxWidth: 330,
  },
  promptRail: {
    marginTop: spacing[4],
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#DCCFBE",
  },
  prompt: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[3],
    paddingVertical: spacing[2],
  },
  promptDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#DCCFBE",
  },
  promptIcon: {
    width: 34,
    height: 34,
    borderRadius: radius.md,
    backgroundColor: "#FFF0E5",
    alignItems: "center",
    justifyContent: "center",
  },
  promptCopy: { flex: 1 },
  promptIntent: {
    color: colors.accentStrong,
    fontSize: 9,
    fontFamily: fonts.bold,
    textTransform: "uppercase",
    letterSpacing: 0.7,
  },
  promptText: {
    color: "#07152D",
    fontSize: 13,
    lineHeight: 18,
    fontFamily: fonts.semibold,
    marginTop: 2,
  },
  trustLine: {
    marginTop: spacing[3],
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing[2],
  },
  trustText: {
    flex: 1,
    color: colors.textSecondary,
    fontSize: 10,
    lineHeight: 15,
    fontFamily: fonts.medium,
  },
});

// ─── History Panel ────────────────────────────────────────────────────────────

function HistoryPanel({
  visible,
  onClose,
  onSelect,
  onNewChat,
  onDeleted,
  activeConvId,
}: {
  visible: boolean;
  onClose: () => void;
  onSelect: (conv: ChatConversation) => void;
  onNewChat: () => void;
  onDeleted: (conversationId: string) => void;
  activeConvId?: string;
}) {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const slideAnim = useRef(new Animated.Value(0)).current;
  const backdropAnim = useRef(new Animated.Value(0)).current;
  const [search, setSearch] = useState("");

  const {
    data: conversations = [],
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["ai-conversations"],
    queryFn: aiApi.listConversations,
    enabled: visible,
  });

  const deleteConversation = useMutation({
    mutationFn: aiApi.deleteConversation,
    onSuccess: (_, conversationId) => {
      queryClient.setQueryData<ChatConversation[]>(
        ["ai-conversations"],
        (current) =>
          current?.filter(
            (conversation) => conversation.id !== conversationId,
          ) || [],
      );
      onDeleted(conversationId);
    },
    onError: () => {
      Alert.alert(
        "Could not delete conversation",
        "The conversation is still in your history. Try again when your connection is stable.",
      );
    },
  });

  useEffect(() => {
    if (visible) {
      refetch();
      Animated.parallel([
        Animated.spring(slideAnim, {
          toValue: 1,
          useNativeDriver: true,
          speed: 20,
          bounciness: 0,
        }),
        Animated.timing(backdropAnim, {
          toValue: 1,
          duration: 250,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 220,
          useNativeDriver: true,
        }),
        Animated.timing(backdropAnim, {
          toValue: 0,
          duration: 220,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible, slideAnim, backdropAnim, refetch]);

  const { width } = useWindowDimensions();
  const panelWidth = Math.min(width * 0.82, 320);

  const translateX = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-panelWidth, 0],
  });

  // Group conversations by date
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const sevenDaysAgo = new Date(today);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const normalizedSearch = search.trim().toLocaleLowerCase();
  const visibleConversations = normalizedSearch
    ? conversations.filter((conversation) =>
        (conversation.title || "New conversation")
          .toLocaleLowerCase()
          .includes(normalizedSearch),
      )
    : conversations;

  function getGroup(dateStr: string | null): string {
    if (!dateStr) return "Older";
    const d = new Date(dateStr);
    if (d >= today) return "Today";
    if (d >= yesterday) return "Yesterday";
    if (d >= sevenDaysAgo) return "Previous 7 days";
    return "Older";
  }

  const grouped: { label: string; items: ChatConversation[] }[] = [];
  const seenGroups = new Map<string, ChatConversation[]>();
  for (const conv of visibleConversations) {
    const g = getGroup(conv.last_message_at);
    if (!seenGroups.has(g)) {
      seenGroups.set(g, []);
      grouped.push({ label: g, items: seenGroups.get(g)! });
    }
    seenGroups.get(g)!.push(conv);
  }

  const confirmDelete = (conversation: ChatConversation) => {
    Alert.alert(
      "Delete conversation?",
      `“${conversation.title || "New conversation"}” will be removed from your history.`,
      [
        { text: "Keep", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => deleteConversation.mutate(conversation.id),
        },
      ],
    );
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
    >
      {/* Backdrop */}
      <Animated.View style={[hp.backdrop, { opacity: backdropAnim }]}>
        <TouchableOpacity
          style={{ flex: 1 }}
          onPress={onClose}
          activeOpacity={1}
        />
      </Animated.View>

      {/* Side panel */}
      <Animated.View
        style={[
          hp.panel,
          {
            width: panelWidth,
            paddingTop: insets.top,
            transform: [{ translateX }],
          },
        ]}
      >
        {/* Panel header */}
        <View style={hp.header}>
          <View style={hp.headerLeft}>
            <View style={hp.logo}>
              <Ionicons name="sparkles" size={14} color={colors.white} />
            </View>
            <Text style={hp.title}>Eduraa AI</Text>
          </View>
          <TouchableOpacity
            style={hp.closeBtn}
            onPress={onClose}
            accessibilityLabel="Close conversation history"
          >
            <Ionicons name="close" size={18} color={colors.muted} />
          </TouchableOpacity>
        </View>

        {/* New chat button */}
        <TouchableOpacity
          style={hp.newBtn}
          onPress={() => {
            onNewChat();
            onClose();
          }}
          activeOpacity={0.8}
        >
          <View style={hp.newBtnIcon}>
            <Ionicons name="add" size={16} color={colors.accent} />
          </View>
          <Text style={hp.newBtnText}>New conversation</Text>
        </TouchableOpacity>

        <View style={hp.searchWrap}>
          <Ionicons name="search" size={15} color={colors.muted} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search conversations"
            placeholderTextColor={colors.placeholder}
            style={hp.searchInput}
            returnKeyType="search"
            autoCorrect={false}
            accessibilityLabel="Search conversations"
          />
          {search ? (
            <TouchableOpacity
              onPress={() => setSearch("")}
              style={hp.clearSearch}
              accessibilityLabel="Clear history search"
            >
              <Ionicons name="close-circle" size={17} color={colors.subtle} />
            </TouchableOpacity>
          ) : null}
        </View>

        <View style={hp.divider} />

        {/* Conversation list */}
        {isLoading ? (
          <View style={hp.loading}>
            <ActivityIndicator size="small" color={colors.accent} />
          </View>
        ) : isError ? (
          <View style={hp.empty}>
            <View style={hp.emptyIcon}>
              <Ionicons
                name="cloud-offline-outline"
                size={20}
                color={colors.dangerText}
              />
            </View>
            <Text style={hp.emptyTitle}>History is unavailable</Text>
            <Text style={hp.emptyText}>
              Your conversations are safe. Check the connection and try again.
            </Text>
            <TouchableOpacity style={hp.retry} onPress={() => void refetch()}>
              <Ionicons name="refresh" size={14} color={colors.white} />
              <Text style={hp.retryText}>Try again</Text>
            </TouchableOpacity>
          </View>
        ) : visibleConversations.length === 0 ? (
          <View style={hp.empty}>
            <View style={hp.emptyIcon}>
              <Ionicons
                name={search ? "search-outline" : "chatbubbles-outline"}
                size={20}
                color={colors.accent}
              />
            </View>
            <Text style={hp.emptyTitle}>
              {search
                ? "No matching conversations"
                : "Your first idea starts here"}
            </Text>
            <Text style={hp.emptyText}>
              {search
                ? "Try a different title or clear the search."
                : "Past conversations will appear here after you ask Eduraa."}
            </Text>
          </View>
        ) : (
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}
          >
            {grouped.map((group) => (
              <View key={group.label}>
                <Text style={hp.groupLabel}>{group.label}</Text>
                {group.items.map((conv) => {
                  const isActive = conv.id === activeConvId;
                  return (
                    <TouchableOpacity
                      key={conv.id}
                      style={[hp.convRow, isActive && hp.convRowActive]}
                      onPress={() => {
                        onSelect(conv);
                        onClose();
                      }}
                      activeOpacity={0.75}
                    >
                      <Ionicons
                        name="chatbubble-outline"
                        size={14}
                        color={isActive ? colors.accent : colors.subtle}
                        style={{ marginTop: 1, flexShrink: 0 }}
                      />
                      <View style={{ flex: 1, overflow: "hidden" }}>
                        <Text
                          style={[hp.convTitle, isActive && hp.convTitleActive]}
                          numberOfLines={1}
                        >
                          {conv.title || "New chat"}
                        </Text>
                        {conv.last_message_at ? (
                          <Text style={hp.convTime}>
                            {relativeTime(conv.last_message_at)}
                          </Text>
                        ) : null}
                      </View>
                      <TouchableOpacity
                        style={hp.deleteBtn}
                        onPress={() => confirmDelete(conv)}
                        disabled={
                          deleteConversation.isPending &&
                          deleteConversation.variables === conv.id
                        }
                        accessibilityLabel={`Delete ${conv.title || "conversation"}`}
                      >
                        {deleteConversation.isPending &&
                        deleteConversation.variables === conv.id ? (
                          <ActivityIndicator
                            size="small"
                            color={colors.danger}
                          />
                        ) : (
                          <Ionicons
                            name="trash-outline"
                            size={15}
                            color={colors.subtle}
                          />
                        )}
                      </TouchableOpacity>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))}
          </ScrollView>
        )}
      </Animated.View>
    </Modal>
  );
}

const hp = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(28,25,23,0.4)",
  },
  panel: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: colors.card,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: colors.border,
    ...shadows.lg,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[4],
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: spacing[2] },
  logo: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 15,
    fontWeight: "800",
    fontFamily: fonts.displayBold,
    color: colors.ink,
    letterSpacing: -0.2,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: radius.md,
    backgroundColor: colors.surface2,
    alignItems: "center",
    justifyContent: "center",
  },

  newBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[3],
    marginHorizontal: spacing[3],
    marginVertical: spacing[3],
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[3],
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.accentMid,
    backgroundColor: colors.accentLight,
  },
  newBtnIcon: {
    width: 26,
    height: 26,
    borderRadius: radius.sm,
    backgroundColor: colors.white,
    alignItems: "center",
    justifyContent: "center",
  },
  newBtnText: {
    fontSize: 13,
    fontWeight: "700",
    fontFamily: fonts.bold,
    color: colors.accent,
  },

  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginBottom: spacing[2],
  },
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 40,
  },
  searchWrap: {
    minHeight: 46,
    marginHorizontal: spacing[3],
    marginBottom: spacing[3],
    paddingHorizontal: spacing[3],
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.surface2,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[2],
  },
  searchInput: {
    flex: 1,
    color: colors.ink,
    fontSize: 13,
    fontFamily: fonts.regular,
    paddingVertical: 0,
  },
  clearSearch: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  empty: {
    paddingHorizontal: spacing[6],
    paddingTop: spacing[8],
    alignItems: "center",
  },
  emptyIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.lg,
    backgroundColor: colors.accentMid,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing[3],
  },
  emptyTitle: {
    textAlign: "center",
    fontSize: 14,
    color: colors.ink,
    fontFamily: fonts.bold,
  },
  emptyText: {
    textAlign: "center",
    fontSize: 12,
    lineHeight: 18,
    color: colors.muted,
    marginTop: spacing[1],
  },
  retry: {
    minHeight: 40,
    marginTop: spacing[4],
    paddingHorizontal: spacing[4],
    borderRadius: radius.full,
    backgroundColor: colors.ink,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[2],
  },
  retryText: { color: colors.white, fontSize: 12, fontFamily: fonts.bold },

  groupLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: colors.subtle,
    textTransform: "uppercase",
    letterSpacing: 0.7,
    paddingHorizontal: spacing[4],
    paddingTop: spacing[3],
    paddingBottom: spacing[1],
  },
  convRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing[3],
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    borderRadius: radius.lg,
    marginHorizontal: spacing[2],
  },
  convRowActive: { backgroundColor: colors.accentLight },
  convTitle: {
    fontSize: 13,
    fontWeight: "500",
    fontFamily: fonts.medium,
    color: colors.ink,
  },
  convTitleActive: { fontWeight: "700", color: colors.accentStrong },
  convTime: { fontSize: 11, color: colors.subtle, marginTop: 2 },
  deleteBtn: {
    width: 34,
    height: 34,
    marginTop: -7,
    marginRight: -7,
    alignItems: "center",
    justifyContent: "center",
  },
});

function fileSizeLabel(size?: number | null) {
  if (!size) return "Ready on this device";
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function readableMemoryValue(item: UserMemoryItem) {
  const preferredKeys = [
    "value",
    "label",
    "name",
    "goal",
    "preference",
    "text",
  ];
  for (const key of preferredKeys) {
    const value = item.value_json?.[key];
    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      return String(value);
    }
    if (Array.isArray(value))
      return value.filter((entry) => typeof entry === "string").join(", ");
  }

  const primitive = Object.values(item.value_json || {}).find(
    (value) =>
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean",
  );
  return primitive !== undefined
    ? String(primitive)
    : item.note || "Remembered by Eduraa";
}

function humanizeMemoryKey(value: string) {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function SheetHeader({
  eyebrow,
  title,
  onClose,
}: {
  eyebrow: string;
  title: string;
  onClose: () => void;
}) {
  return (
    <View style={sheet.header}>
      <View style={{ flex: 1 }}>
        <Text style={sheet.eyebrow}>{eyebrow}</Text>
        <Text style={sheet.title}>{title}</Text>
      </View>
      <TouchableOpacity
        style={sheet.close}
        onPress={onClose}
        accessibilityLabel={`Close ${title}`}
      >
        <Ionicons name="close" size={19} color={colors.ink} />
      </TouchableOpacity>
    </View>
  );
}

function AttachmentSheet({
  visible,
  onClose,
  selectedPaper,
  onSelectPaper,
  localAttachments,
  onAddLocal,
  onRemoveLocal,
}: {
  visible: boolean;
  onClose: () => void;
  selectedPaper: PaperListItem | null;
  onSelectPaper: (paper: PaperListItem) => void;
  localAttachments: LocalAttachment[];
  onAddLocal: (attachment: LocalAttachment) => void;
  onRemoveLocal: (attachmentId: string) => void;
}) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const papersQuery = useQuery({
    queryKey: ["studio-paper-context"],
    queryFn: () => papersApi.list({ skip: 0, limit: 8 }),
    enabled: visible,
  });

  const addDocument = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: ["application/pdf", "image/jpeg", "image/png", "image/webp"],
      multiple: false,
      copyToCacheDirectory: true,
    });
    if (result.canceled || !result.assets?.length) return;
    const asset = result.assets[0];
    onAddLocal({
      id: `${asset.uri}-${Date.now()}`,
      name: asset.name || "Study document",
      uri: asset.uri,
      mimeType: asset.mimeType,
      size: asset.size,
      source: "document",
    });
  };

  const addGalleryImage = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        "Photo access needed",
        "Allow photo access to stage an image for AI Studio.",
      );
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: false,
      quality: 0.9,
    });
    if (result.canceled || !result.assets?.length) return;
    const asset = result.assets[0];
    onAddLocal({
      id: `${asset.uri}-${Date.now()}`,
      name: asset.fileName || "Gallery image",
      uri: asset.uri,
      mimeType: asset.mimeType,
      size: asset.fileSize,
      source: "gallery",
    });
  };

  const addCameraImage = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        "Camera access needed",
        "Allow camera access to stage a photo for AI Studio.",
      );
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      quality: 0.9,
    });
    if (result.canceled || !result.assets?.length) return;
    const asset = result.assets[0];
    onAddLocal({
      id: `${asset.uri}-${Date.now()}`,
      name: asset.fileName || `Study photo ${localAttachments.length + 1}`,
      uri: asset.uri,
      mimeType: asset.mimeType,
      size: asset.fileSize,
      source: "camera",
    });
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={sheet.modal}>
        <TouchableOpacity
          style={sheet.backdrop}
          onPress={onClose}
          activeOpacity={1}
          accessibilityLabel="Close attachments"
        />
        <View
          style={[
            sheet.panel,
            {
              maxHeight: height * 0.84,
              paddingBottom: Math.max(insets.bottom, spacing[4]),
            },
          ]}
        >
          <View style={sheet.grabber} />
          <SheetHeader
            eyebrow="ADD CONTEXT"
            title="Bring something in"
            onClose={onClose}
          />
          <ScrollView
            contentContainerStyle={sheet.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            <Text style={sheet.sectionLabel}>FROM EDURAA</Text>
            <Text style={sheet.sectionCopy}>
              Attach a paper Eduraa already knows. It will be sent with your
              next message.
            </Text>

            {papersQuery.isLoading ? (
              <View style={sheet.loadingRow}>
                <ActivityIndicator size="small" color={colors.accent} />
                <Text style={sheet.loadingText}>
                  Loading your paper library
                </Text>
              </View>
            ) : papersQuery.isError ? (
              <TouchableOpacity
                style={sheet.inlineError}
                onPress={() => void papersQuery.refetch()}
              >
                <Ionicons name="refresh" size={16} color={colors.dangerText} />
                <Text style={sheet.inlineErrorText}>
                  Paper library unavailable. Tap to retry.
                </Text>
              </TouchableOpacity>
            ) : papersQuery.data?.items.length ? (
              <View style={sheet.paperList}>
                {papersQuery.data.items.map((paper) => {
                  const isSelected = paper.id === selectedPaper?.id;
                  return (
                    <TouchableOpacity
                      key={paper.id}
                      style={[
                        sheet.paperRow,
                        isSelected && sheet.paperRowSelected,
                      ]}
                      onPress={() => onSelectPaper(paper)}
                      activeOpacity={0.75}
                    >
                      <View
                        style={[
                          sheet.paperIcon,
                          isSelected && sheet.paperIconSelected,
                        ]}
                      >
                        <Ionicons
                          name="document-text-outline"
                          size={17}
                          color={isSelected ? colors.white : colors.accent}
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={sheet.paperTitle} numberOfLines={1}>
                          {paper.title}
                        </Text>
                        <Text style={sheet.paperMeta} numberOfLines={1}>
                          {[
                            paper.subject_name,
                            paper.question_count
                              ? `${paper.question_count} questions`
                              : null,
                          ]
                            .filter(Boolean)
                            .join(" · ") || "Eduraa paper"}
                        </Text>
                      </View>
                      <Ionicons
                        name={
                          isSelected ? "checkmark-circle" : "add-circle-outline"
                        }
                        size={20}
                        color={isSelected ? colors.success : colors.accent}
                      />
                    </TouchableOpacity>
                  );
                })}
              </View>
            ) : (
              <View style={sheet.inlineEmpty}>
                <Text style={sheet.inlineEmptyTitle}>No papers yet</Text>
                <Text style={sheet.inlineEmptyText}>
                  Create or receive a paper in Eduraa, then attach it here.
                </Text>
              </View>
            )}

            <View style={sheet.sectionDivider} />
            <Text style={sheet.sectionLabel}>FROM THIS DEVICE</Text>
            <Text style={sheet.sectionCopy}>
              Stage a PDF or image here. Device uploads are not sent until AI
              chat supports a file token.
            </Text>
            <View style={sheet.sourceGrid}>
              <TouchableOpacity
                style={sheet.sourceAction}
                onPress={() => void addCameraImage()}
              >
                <Ionicons
                  name="camera-outline"
                  size={21}
                  color={colors.accentStrong}
                />
                <Text style={sheet.sourceText}>Photo</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={sheet.sourceAction}
                onPress={() => void addDocument()}
              >
                <Ionicons
                  name="document-attach-outline"
                  size={21}
                  color={colors.accentStrong}
                />
                <Text style={sheet.sourceText}>Document</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={sheet.sourceAction}
                onPress={() => void addGalleryImage()}
              >
                <Ionicons
                  name="images-outline"
                  size={21}
                  color={colors.accentStrong}
                />
                <Text style={sheet.sourceText}>Gallery</Text>
              </TouchableOpacity>
            </View>

            {localAttachments.map((attachment) => (
              <View key={attachment.id} style={sheet.localRow}>
                <View style={sheet.localIcon}>
                  <Ionicons
                    name={
                      attachment.source === "camera"
                        ? "camera-outline"
                        : attachment.source === "gallery"
                          ? "image-outline"
                          : "document-outline"
                    }
                    size={17}
                    color={colors.accent}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={sheet.paperTitle} numberOfLines={1}>
                    {attachment.name}
                  </Text>
                  <Text style={sheet.paperMeta}>
                    {fileSizeLabel(attachment.size)} · staged locally
                  </Text>
                </View>
                <TouchableOpacity
                  style={sheet.remove}
                  onPress={() => onRemoveLocal(attachment.id)}
                  accessibilityLabel={`Remove ${attachment.name}`}
                >
                  <Ionicons name="close" size={17} color={colors.dangerText} />
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function ContextSheet({
  visible,
  onClose,
  conversationId,
  profileRows,
}: {
  visible: boolean;
  onClose: () => void;
  conversationId?: string;
  profileRows: ContextRow[];
}) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const conversationMemory = useQuery({
    queryKey: ["ai-conversation-memory", conversationId],
    queryFn: () => aiApi.getConversationMemory(conversationId!),
    enabled: visible && Boolean(conversationId),
  });
  const userMemory = useQuery({
    queryKey: ["ai-user-memory"],
    queryFn: aiApi.listUserMemory,
    enabled: visible,
  });

  const conversationRows: ContextRow[] = conversationMemory.data
    ? [
        conversationMemory.data.active_domain
          ? {
              status: "Active",
              label: "Current domain",
              value: conversationMemory.data.active_domain,
            }
          : null,
        conversationMemory.data.active_task
          ? {
              status: "In progress",
              label: "Current task",
              value: conversationMemory.data.active_task,
            }
          : null,
        conversationMemory.data.summary
          ? {
              status: "Remembered",
              label: "Conversation summary",
              value: conversationMemory.data.summary,
            }
          : null,
      ].filter((row): row is ContextRow => Boolean(row))
    : [];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={sheet.modal}>
        <TouchableOpacity
          style={sheet.backdrop}
          onPress={onClose}
          activeOpacity={1}
          accessibilityLabel="Close context and memory"
        />
        <View
          style={[
            sheet.panel,
            {
              maxHeight: height * 0.82,
              paddingBottom: Math.max(insets.bottom, spacing[4]),
            },
          ]}
        >
          <View style={sheet.grabber} />
          <SheetHeader
            eyebrow="CONVERSATION INTELLIGENCE"
            title="Context & memory"
            onClose={onClose}
          />
          <ScrollView
            contentContainerStyle={sheet.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            <Text style={sheet.sectionLabel}>CONFIRMED PROFILE</Text>
            <View style={sheet.memoryList}>
              {profileRows.map((row) => (
                <MemoryRow key={`${row.label}-${row.value}`} row={row} />
              ))}
            </View>

            <View style={sheet.sectionDivider} />
            <Text style={sheet.sectionLabel}>THIS CONVERSATION</Text>
            {!conversationId ? (
              <View style={sheet.inlineEmpty}>
                <Text style={sheet.inlineEmptyTitle}>
                  No conversation memory yet
                </Text>
                <Text style={sheet.inlineEmptyText}>
                  Memory becomes visible after your first message.
                </Text>
              </View>
            ) : conversationMemory.isLoading ? (
              <View style={sheet.loadingRow}>
                <ActivityIndicator size="small" color={colors.accent} />
                <Text style={sheet.loadingText}>
                  Reading conversation context
                </Text>
              </View>
            ) : conversationMemory.isError ? (
              <TouchableOpacity
                style={sheet.inlineError}
                onPress={() => void conversationMemory.refetch()}
              >
                <Ionicons name="refresh" size={16} color={colors.dangerText} />
                <Text style={sheet.inlineErrorText}>
                  Conversation context unavailable. Tap to retry.
                </Text>
              </TouchableOpacity>
            ) : conversationRows.length ? (
              <View style={sheet.memoryList}>
                {conversationRows.map((row) => (
                  <MemoryRow key={`${row.label}-${row.value}`} row={row} />
                ))}
              </View>
            ) : (
              <View style={sheet.inlineEmpty}>
                <Text style={sheet.inlineEmptyTitle}>Nothing assumed</Text>
                <Text style={sheet.inlineEmptyText}>
                  Eduraa has not stored conversation-specific context yet.
                </Text>
              </View>
            )}

            <View style={sheet.sectionDivider} />
            <Text style={sheet.sectionLabel}>REMEMBERED PREFERENCES</Text>
            {userMemory.isLoading ? (
              <View style={sheet.loadingRow}>
                <ActivityIndicator size="small" color={colors.accent} />
                <Text style={sheet.loadingText}>
                  Loading remembered preferences
                </Text>
              </View>
            ) : userMemory.isError ? (
              <TouchableOpacity
                style={sheet.inlineError}
                onPress={() => void userMemory.refetch()}
              >
                <Ionicons name="refresh" size={16} color={colors.dangerText} />
                <Text style={sheet.inlineErrorText}>
                  Preferences unavailable. Tap to retry.
                </Text>
              </TouchableOpacity>
            ) : userMemory.data?.length ? (
              <View style={sheet.memoryList}>
                {userMemory.data.slice(0, 5).map((item) => (
                  <MemoryRow
                    key={item.id}
                    row={{
                      status: item.status || "Remembered",
                      label: humanizeMemoryKey(item.memory_key),
                      value: readableMemoryValue(item),
                    }}
                  />
                ))}
              </View>
            ) : (
              <View style={sheet.inlineEmpty}>
                <Text style={sheet.inlineEmptyTitle}>No saved preferences</Text>
                <Text style={sheet.inlineEmptyText}>
                  Eduraa will only show preferences the backend has actually
                  remembered.
                </Text>
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function MemoryRow({ row }: { row: ContextRow }) {
  return (
    <View style={sheet.memoryRow}>
      <View style={sheet.memoryMarker} />
      <View style={{ flex: 1 }}>
        <Text style={sheet.memoryStatus}>{row.status}</Text>
        <Text style={sheet.memoryLabel}>{row.label}</Text>
        <Text style={sheet.memoryValue}>{row.value}</Text>
      </View>
    </View>
  );
}

const sheet = StyleSheet.create({
  modal: { flex: 1, justifyContent: "flex-end" },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(7,21,45,0.48)",
  },
  panel: {
    overflow: "hidden",
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    backgroundColor: "#FFFAF2",
    ...shadows.lg,
  },
  grabber: {
    alignSelf: "center",
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#C9BBA9",
    marginTop: spacing[2],
  },
  header: {
    minHeight: 76,
    paddingHorizontal: spacing[5],
    paddingVertical: spacing[3],
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[3],
  },
  eyebrow: {
    color: colors.accentStrong,
    fontSize: 9,
    fontFamily: fonts.extrabold,
    letterSpacing: 1.1,
  },
  title: {
    color: "#07152D",
    fontSize: 23,
    lineHeight: 28,
    fontFamily: fonts.displaySemibold,
    marginTop: 2,
  },
  close: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: "#DCCFBE",
    backgroundColor: colors.white,
    alignItems: "center",
    justifyContent: "center",
  },
  scrollContent: { paddingHorizontal: spacing[5], paddingBottom: spacing[5] },
  sectionLabel: {
    color: colors.accentStrong,
    fontSize: 9,
    fontFamily: fonts.extrabold,
    letterSpacing: 1,
  },
  sectionCopy: {
    color: colors.textSecondary,
    fontSize: 11,
    lineHeight: 17,
    fontFamily: fonts.regular,
    marginTop: spacing[1],
    marginBottom: spacing[3],
  },
  sectionDivider: {
    height: 1,
    backgroundColor: "#E0D6C8",
    marginVertical: spacing[5],
  },
  loadingRow: {
    minHeight: 62,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[3],
  },
  loadingText: { color: colors.muted, fontSize: 12, fontFamily: fonts.medium },
  inlineError: {
    minHeight: 54,
    paddingHorizontal: spacing[3],
    borderLeftWidth: 3,
    borderLeftColor: colors.danger,
    backgroundColor: colors.dangerBg,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[2],
  },
  inlineErrorText: {
    flex: 1,
    color: colors.dangerText,
    fontSize: 11,
    lineHeight: 16,
    fontFamily: fonts.semibold,
  },
  inlineEmpty: {
    paddingVertical: spacing[4],
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#E0D6C8",
  },
  inlineEmptyTitle: { color: "#07152D", fontSize: 13, fontFamily: fonts.bold },
  inlineEmptyText: {
    color: colors.textSecondary,
    fontSize: 11,
    lineHeight: 17,
    fontFamily: fonts.regular,
    marginTop: spacing[1],
  },
  paperList: { borderTopWidth: 1, borderColor: "#E0D6C8" },
  paperRow: {
    minHeight: 66,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[3],
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E0D6C8",
  },
  paperRowSelected: {
    backgroundColor: "#FFF0E5",
    marginHorizontal: -spacing[2],
    paddingHorizontal: spacing[2],
  },
  paperIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    backgroundColor: colors.white,
    alignItems: "center",
    justifyContent: "center",
  },
  paperIconSelected: { backgroundColor: colors.accent },
  paperTitle: { color: "#07152D", fontSize: 12, fontFamily: fonts.bold },
  paperMeta: {
    color: colors.textSecondary,
    fontSize: 10,
    fontFamily: fonts.regular,
    marginTop: 2,
  },
  sourceGrid: { flexDirection: "row", gap: spacing[2], marginTop: spacing[3] },
  sourceAction: {
    flex: 1,
    minHeight: 76,
    borderWidth: 1,
    borderColor: "#DCCFBE",
    borderRadius: radius.md,
    backgroundColor: colors.white,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing[2],
  },
  sourceText: { color: "#07152D", fontSize: 11, fontFamily: fonts.bold },
  localRow: {
    minHeight: 62,
    marginTop: spacing[3],
    paddingHorizontal: spacing[3],
    borderLeftWidth: 3,
    borderLeftColor: colors.accent,
    backgroundColor: colors.white,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[3],
  },
  localIcon: {
    width: 34,
    height: 34,
    borderRadius: radius.sm,
    backgroundColor: "#FFF0E5",
    alignItems: "center",
    justifyContent: "center",
  },
  remove: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
  },
  memoryList: { borderTopWidth: 1, borderColor: "#E0D6C8" },
  memoryRow: {
    minHeight: 78,
    paddingVertical: spacing[3],
    flexDirection: "row",
    gap: spacing[3],
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E0D6C8",
  },
  memoryMarker: {
    width: 4,
    alignSelf: "stretch",
    borderRadius: 2,
    backgroundColor: colors.accent,
  },
  memoryStatus: {
    color: colors.successText,
    fontSize: 9,
    fontFamily: fonts.bold,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  memoryLabel: {
    color: "#07152D",
    fontSize: 12,
    fontFamily: fonts.bold,
    marginTop: 2,
  },
  memoryValue: {
    color: colors.textSecondary,
    fontSize: 11,
    lineHeight: 17,
    fontFamily: fonts.regular,
    marginTop: 2,
  },
});

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function AIStudioScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavigationProp<ParamListBase>>();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const [messages, setMessages] = useState<LocalMessage[]>([WELCOME_MESSAGE]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [activeConvTitle, setActiveConvTitle] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [inputFocused, setInputFocused] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [failedRequest, setFailedRequest] = useState<FailedRequest | null>(
    null,
  );
  const [notice, setNotice] = useState<string | null>(null);
  const [showContext, setShowContext] = useState(false);
  const [showAttachments, setShowAttachments] = useState(false);
  const [selectedPaper, setSelectedPaper] = useState<PaperListItem | null>(
    null,
  );
  const [localAttachments, setLocalAttachments] = useState<LocalAttachment[]>(
    [],
  );
  const [composerError, setComposerError] = useState<string | null>(null);
  const [conversationLoadFailure, setConversationLoadFailure] =
    useState<ConversationLoadFailure | null>(null);

  const listRef = useRef<FlatList>(null);
  const inputRef = useRef<TextInput>(null);
  const requestControllerRef = useRef<AbortController | null>(null);
  const requestSequenceRef = useRef(0);
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const visibleMessages = messages.filter(
    (message) => message.id !== WELCOME_MESSAGE.id,
  );
  const latestAssistantId = [...visibleMessages]
    .reverse()
    .find((message) => message.role === "assistant")?.id;
  const subjectContext = user?.b2c_subjects?.length
    ? user.b2c_subjects
    : user?.subjects_taught || [];
  const examContext = user?.b2c_target_exam || user?.exam_track;
  const contextLabels = [
    examContext,
    subjectContext[0],
    selectedPaper?.title,
  ].filter((value): value is string => Boolean(value));
  const profileRows: ContextRow[] = [];
  if (examContext)
    profileRows.push({
      status: "Confirmed",
      label: "Learning goal",
      value: examContext,
    });
  if (subjectContext.length)
    profileRows.push({
      status: "Active",
      label: "Subjects",
      value: subjectContext.join(", "),
    });
  if (user?.b2c_board || user?.b2c_standard) {
    profileRows.push({
      status: "Confirmed",
      label: "Curriculum",
      value: [user.b2c_board, user.b2c_standard].filter(Boolean).join(" · "),
    });
  }
  if (selectedPaper)
    profileRows.push({
      status: "Attached",
      label: "Paper context",
      value: selectedPaper.title,
    });
  if (!profileRows.length) {
    profileRows.push({
      status: "Confirmed",
      label: "Learning identity",
      value: user?.display_name || "Current Eduraa learner",
    });
  }

  useEffect(
    () => () => {
      if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
      requestSequenceRef.current += 1;
      requestControllerRef.current?.abort();
    },
    [],
  );

  const showNotice = useCallback((message: string) => {
    setNotice(message);
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = setTimeout(() => setNotice(null), 1800);
  }, []);

  const navigateBack = useCallback(() => {
    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }

    const routeNames = navigation.getState().routeNames;
    if (routeNames.includes("LearningHome")) {
      navigation.reset({ index: 0, routes: [{ name: "LearningHome" }] });
      return;
    }
    if (routeNames.includes("StaffWorkspace")) {
      navigation.reset({ index: 0, routes: [{ name: "StaffWorkspace" }] });
      return;
    }
    if (routeNames.includes("StaffHome")) {
      navigation.reset({ index: 0, routes: [{ name: "StaffHome" }] });
    }
  }, [navigation]);

  const hasLocalStackBack = useNavigationState(
    (state) => state.type === "stack" && state.index > 0,
  );
  const edgeBackGesture = useMemo(
    () =>
      Gesture.Pan()
        .enabled(Platform.OS !== "web" && !hasLocalStackBack)
        .runOnJS(true)
        .hitSlop({ left: 0, width: 24 })
        .activeOffsetX(36)
        .failOffsetY([-24, 24])
        .onEnd(({ translationX }) => {
          if (translationX >= 72) navigateBack();
        }),
    [hasLocalStackBack, navigateBack],
  );

  const scrollToEnd = useCallback((animated = true) => {
    setTimeout(() => listRef.current?.scrollToEnd({ animated }), 80);
  }, []);

  // ── Send a message ──────────────────────────────────────────────────────────
  const sendMessage = useCallback(
    async (text?: string, appendUserMessage = true) => {
      const content = (text ?? input).trim();
      if (!content || loading) return;
      if (localAttachments.length) {
        setComposerError(
          "This device file is staged locally but the AI chat API cannot read uploads yet. Remove it or attach an Eduraa paper instead.",
        );
        return;
      }

      if (appendUserMessage) {
        const userMsg: LocalMessage = {
          id: `u_${Date.now()}`,
          role: "user",
          content,
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, userMsg]);
        if (!conversationId) {
          setActiveConvTitle(
            content.length > 38 ? `${content.slice(0, 38).trim()}…` : content,
          );
        }
      }

      setInput("");
      setComposerError(null);
      setFailedRequest(null);
      setLoading(true);
      scrollToEnd();

      const requestController = new AbortController();
      const requestSequence = ++requestSequenceRef.current;
      requestControllerRef.current = requestController;
      const assistantMessageId = `a_${Date.now()}`;
      let hasStreamedContent = false;

      try {
        const res = await aiApi.chatStream(
          {
            message: content,
            conversation_id: conversationId,
            paper_id: selectedPaper?.id,
          },
          (streamedContent) => {
            if (requestSequenceRef.current !== requestSequence) return;
            const isFirstChunk = !hasStreamedContent;
            setMessages((prev) => {
              if (isFirstChunk) {
                hasStreamedContent = true;
                return [
                  ...prev,
                  {
                    id: assistantMessageId,
                    role: "assistant",
                    content: streamedContent,
                    timestamp: new Date(),
                    pending: true,
                  },
                ];
              }
              return prev.map((message) =>
                message.id === assistantMessageId
                  ? { ...message, content: streamedContent, pending: true }
                  : message,
              );
            });
            if (isFirstChunk) scrollToEnd(false);
          },
          requestController.signal,
        );

        if (requestSequenceRef.current !== requestSequence) return;

        if (res.conversation_id) {
          setConversationId(res.conversation_id);
          // Invalidate conversation list so it reflects the new/updated conversation
          queryClient.invalidateQueries({ queryKey: ["ai-conversations"] });
        }

        setMessages((prev) => {
          if (hasStreamedContent) {
            return prev.map((message) =>
              message.id === assistantMessageId
                ? { ...message, content: res.response, pending: false }
                : message,
            );
          }
          return [
            ...prev,
            {
              id: assistantMessageId,
              role: "assistant",
              content: res.response || "Sorry, I could not process that.",
              timestamp: new Date(),
            },
          ];
        });
      } catch (err: any) {
        if (requestSequenceRef.current !== requestSequence) return;
        const wasCancelled =
          err?.code === "ERR_CANCELED" || requestController.signal.aborted;
        if (hasStreamedContent) {
          setMessages((prev) =>
            prev.map((message) =>
              message.id === assistantMessageId
                ? { ...message, pending: false }
                : message,
            ),
          );
        }
        setFailedRequest({
          content,
          partialMessageId: hasStreamedContent ? assistantMessageId : undefined,
          message: wasCancelled
            ? "Response stopped. Your conversation is still here."
            : err?.message ||
              err?.response?.data?.detail ||
              "The response paused. Check your connection and try again.",
        });
      } finally {
        if (requestSequenceRef.current === requestSequence) {
          requestControllerRef.current = null;
          setLoading(false);
        }
      }
    },
    [
      input,
      loading,
      localAttachments.length,
      conversationId,
      selectedPaper?.id,
      queryClient,
      scrollToEnd,
    ],
  );

  const stopGeneration = useCallback(() => {
    requestControllerRef.current?.abort();
  }, []);

  const retryFailedRequest = useCallback(() => {
    if (!failedRequest) return;
    if (failedRequest.partialMessageId) {
      setMessages((current) =>
        current.filter(
          (message) => message.id !== failedRequest.partialMessageId,
        ),
      );
    }
    void sendMessage(failedRequest.content, false);
  }, [failedRequest, sendMessage]);

  const copyPartialResponse = useCallback(async () => {
    if (!failedRequest?.partialMessageId) return;
    const partial = messages.find(
      (message) => message.id === failedRequest.partialMessageId,
    );
    if (!partial?.content) return;
    await Clipboard.setStringAsync(partial.content);
    showNotice("Partial answer copied");
  }, [failedRequest, messages, showNotice]);

  const chooseStarter = useCallback((prompt: string) => {
    setInput(prompt);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  const copyResponse = useCallback(
    async (message: LocalMessage) => {
      await Clipboard.setStringAsync(message.content);
      showNotice("Response copied");
    },
    [showNotice],
  );

  const regenerateLastResponse = useCallback(() => {
    if (loading) return;
    const latestAssistantIndex = messages.findLastIndex(
      (message) => message.id === latestAssistantId,
    );
    if (latestAssistantIndex < 0) return;
    const sourceMessage = messages
      .slice(0, latestAssistantIndex)
      .reverse()
      .find((message) => message.role === "user");
    if (!sourceMessage) return;
    setMessages((current) =>
      current.filter((message) => message.id !== latestAssistantId),
    );
    setFailedRequest(null);
    void sendMessage(sourceMessage.content, false);
  }, [latestAssistantId, loading, messages, sendMessage]);

  const prepareQuestionsPrompt = useCallback(() => {
    setInput(
      "Turn this explanation into 5 exam-style practice questions. Start easy, then increase the difficulty.",
    );
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  const addLocalAttachment = useCallback((attachment: LocalAttachment) => {
    setSelectedPaper(null);
    setLocalAttachments((current) => [...current, attachment].slice(-3));
    setComposerError(
      "Device files can be staged and reviewed here, but this chat API cannot analyze them yet. Choose an Eduraa paper for grounded analysis.",
    );
  }, []);

  const removeLocalAttachment = useCallback((attachmentId: string) => {
    setLocalAttachments((current) => {
      const next = current.filter(
        (attachment) => attachment.id !== attachmentId,
      );
      if (!next.length) setComposerError(null);
      return next;
    });
  }, []);

  const attachPaper = useCallback(
    (paper: PaperListItem) => {
      setSelectedPaper(paper);
      setLocalAttachments([]);
      setComposerError(null);
      setShowAttachments(false);
      showNotice("Paper added to this conversation");
    },
    [showNotice],
  );

  const clearAttachmentContext = useCallback(() => {
    setSelectedPaper(null);
    setLocalAttachments([]);
    setComposerError(null);
  }, []);

  // ── New chat ────────────────────────────────────────────────────────────────
  const startNewChat = useCallback(() => {
    requestSequenceRef.current += 1;
    requestControllerRef.current?.abort();
    setMessages([WELCOME_MESSAGE]);
    setConversationId(undefined);
    setActiveConvTitle(null);
    setInput("");
    setLoading(false);
    setFailedRequest(null);
    setConversationLoadFailure(null);
    clearAttachmentContext();
  }, [clearAttachmentContext]);

  // ── Load a past conversation ────────────────────────────────────────────────
  const loadConversation = useCallback(
    async (conv: ChatConversation) => {
      requestSequenceRef.current += 1;
      requestControllerRef.current?.abort();
      setLoading(false);
      setLoadingHistory(true);
      setConversationLoadFailure(null);
      clearAttachmentContext();
      try {
        const msgs = await aiApi.getMessages(conv.id);
        const localMsgs: LocalMessage[] = msgs.map((m) => ({
          id: m.id,
          role: m.role === "user" ? "user" : "assistant",
          content: m.content,
          timestamp: new Date(m.created_at),
        }));
        setConversationId(conv.id);
        setActiveConvTitle(conv.title);
        setFailedRequest(null);
        setMessages(localMsgs.length > 0 ? localMsgs : [WELCOME_MESSAGE]);
        scrollToEnd(false);
      } catch (error: any) {
        setConversationLoadFailure({
          conversation: conv,
          message:
            error?.response?.data?.detail ||
            error?.message ||
            "That conversation could not be opened. Your current chat is unchanged.",
        });
      } finally {
        setLoadingHistory(false);
      }
    },
    [clearAttachmentContext, scrollToEnd],
  );

  const canSend =
    input.trim().length > 0 && !loading && localAttachments.length === 0;
  const statusText = loading
    ? "thinking with your learning context"
    : failedRequest
      ? "connection interrupted"
      : selectedPaper
        ? "paper context attached"
        : activeConvTitle
          ? "conversation active"
          : "ready with your learning context";

  return (
    <GestureDetector gesture={edgeBackGesture}>
      <View style={styles.root}>
      {/* Top bar */}
      <View style={[styles.topBar, { paddingTop: insets.top + spacing[2] }]}>
        <View style={styles.topActions}>
          <TouchableOpacity
            style={styles.topBtn}
            onPress={navigateBack}
            activeOpacity={0.75}
            accessibilityRole="button"
            accessibilityLabel="Back from AI Studio"
            hitSlop={4}
          >
            <Ionicons name="arrow-back" size={20} color={colors.ink} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.topBtn}
            onPress={() => setShowHistory(true)}
            activeOpacity={0.75}
            accessibilityRole="button"
            accessibilityLabel="Open conversation history"
          >
            <Ionicons name="menu" size={20} color={colors.ink} />
          </TouchableOpacity>
        </View>

        <View style={styles.topCenter}>
          <Text style={styles.topTitle} numberOfLines={1}>
            {activeConvTitle || "Eduraa AI"}
          </Text>
          <View style={styles.onlinePill}>
            <View
              style={[styles.onlineDot, failedRequest && styles.offlineDot]}
            />
            <Text
              style={[styles.onlineText, failedRequest && styles.offlineText]}
              numberOfLines={1}
            >
              {statusText}
            </Text>
          </View>
        </View>

        <TouchableOpacity
          style={styles.topBtn}
          onPress={startNewChat}
          activeOpacity={0.75}
          accessibilityLabel="New conversation"
        >
          <Ionicons name="add" size={21} color={colors.ink} />
        </TouchableOpacity>
      </View>

      {/* ─── Keyboard wrapper — KEY FIX ──────────────────────────────────── */}
      {/*
        behavior="padding" pushes content up by keyboard height.
        keyboardVerticalOffset must be 0 here — the KAV is below our
        custom topBar, so there is nothing above it to offset.
        The topBar is OUTSIDE the KAV so it doesn't move.
      */}
      <KeyboardAvoidingView
        style={styles.kav}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={0}
      >
        {/* Messages */}
        {loadingHistory ? (
          <View style={styles.loadingCenter}>
            <ActivityIndicator color={colors.accent} size="large" />
            <Text style={styles.loadingText}>Loading conversation…</Text>
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={visibleMessages}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <MessageBubble
                msg={item}
                showActions={
                  item.id === latestAssistantId && !loading && !failedRequest
                }
                onCopy={copyResponse}
                onRegenerate={regenerateLastResponse}
                onMakeQuestions={prepareQuestionsPrompt}
              />
            )}
            contentContainerStyle={[
              styles.messageList,
              visibleMessages.length === 0 && styles.messageListEmpty,
            ]}
            ItemSeparatorComponent={() => (
              <View style={{ height: spacing[3] }} />
            )}
            showsVerticalScrollIndicator={false}
            keyboardDismissMode="interactive"
            keyboardShouldPersistTaps="handled"
            maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
            ListHeaderComponent={
              visibleMessages.length > 0 && contextLabels.length > 0 ? (
                <View style={styles.contextStrip}>
                  <View style={styles.contextAccent} />
                  <Ionicons
                    name="layers-outline"
                    size={14}
                    color={colors.accentStrong}
                  />
                  <Text style={styles.contextStripText} numberOfLines={2}>
                    {contextLabels.join(" · ")}
                  </Text>
                </View>
              ) : null
            }
            ListEmptyComponent={<CalmStart onChoose={chooseStarter} />}
            ListFooterComponent={
              loading ? (
                <View style={styles.generationState}>
                  <TypingDots />
                  <View style={styles.generationMeta}>
                    <Text style={styles.generationText}>
                      Building the next useful step
                    </Text>
                    <TouchableOpacity
                      style={styles.stopButton}
                      onPress={stopGeneration}
                    >
                      <Ionicons name="stop" size={11} color={colors.white} />
                      <Text style={styles.stopButtonText}>Stop</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : failedRequest ? (
                <View style={styles.failureCard}>
                  <View style={styles.failureIcon}>
                    <Ionicons
                      name="cloud-offline-outline"
                      size={18}
                      color={colors.dangerText}
                    />
                  </View>
                  <View style={styles.failureCopy}>
                    <Text style={styles.failureTitle}>
                      Your conversation is safe
                    </Text>
                    <Text style={styles.failureText}>
                      {failedRequest.message}
                    </Text>
                    <View style={styles.recoveryActions}>
                      <TouchableOpacity
                        style={styles.retryButton}
                        onPress={retryFailedRequest}
                      >
                        <Ionicons
                          name="refresh"
                          size={14}
                          color={colors.white}
                        />
                        <Text style={styles.retryButtonText}>Try again</Text>
                      </TouchableOpacity>
                      {failedRequest.partialMessageId ? (
                        <TouchableOpacity
                          style={styles.copyPartialButton}
                          onPress={() => void copyPartialResponse()}
                        >
                          <Ionicons
                            name="copy-outline"
                            size={14}
                            color={colors.dangerText}
                          />
                          <Text style={styles.copyPartialText}>
                            Copy partial answer
                          </Text>
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  </View>
                </View>
              ) : conversationLoadFailure ? (
                <View style={styles.failureCard}>
                  <View style={styles.failureIcon}>
                    <Ionicons
                      name="chatbubble-ellipses-outline"
                      size={18}
                      color={colors.dangerText}
                    />
                  </View>
                  <View style={styles.failureCopy}>
                    <Text style={styles.failureTitle}>
                      Couldn’t open that conversation
                    </Text>
                    <Text style={styles.failureText}>
                      {conversationLoadFailure.message}
                    </Text>
                    <TouchableOpacity
                      style={styles.retryButton}
                      onPress={() =>
                        void loadConversation(
                          conversationLoadFailure.conversation,
                        )
                      }
                    >
                      <Ionicons name="refresh" size={14} color={colors.white} />
                      <Text style={styles.retryButtonText}>
                        Try loading again
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : null
            }
          />
        )}

        {/* Input bar */}
        <View
          style={[
            styles.inputBar,
            { paddingBottom: Math.max(insets.bottom, 12) },
            inputFocused && styles.inputBarFocused,
          ]}
        >
          {selectedPaper ? (
            <View style={styles.attachmentContext}>
              <View style={styles.attachmentContextIcon}>
                <Ionicons
                  name="document-text-outline"
                  size={15}
                  color={colors.accentStrong}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.attachmentContextLabel}>PAPER CONTEXT</Text>
                <Text style={styles.attachmentContextTitle} numberOfLines={1}>
                  {selectedPaper.title}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.attachmentRemove}
                onPress={() => setSelectedPaper(null)}
                accessibilityLabel={`Remove ${selectedPaper.title}`}
              >
                <Ionicons name="close" size={17} color={colors.muted} />
              </TouchableOpacity>
            </View>
          ) : null}
          {localAttachments.map((attachment) => (
            <View
              key={attachment.id}
              style={[styles.attachmentContext, styles.localAttachmentContext]}
            >
              <View style={styles.attachmentContextIcon}>
                <Ionicons
                  name="document-outline"
                  size={15}
                  color={colors.dangerText}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text
                  style={[
                    styles.attachmentContextLabel,
                    { color: colors.dangerText },
                  ]}
                >
                  STAGED LOCALLY
                </Text>
                <Text style={styles.attachmentContextTitle} numberOfLines={1}>
                  {attachment.name}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.attachmentRemove}
                onPress={() => removeLocalAttachment(attachment.id)}
                accessibilityLabel={`Remove ${attachment.name}`}
              >
                <Ionicons name="close" size={17} color={colors.muted} />
              </TouchableOpacity>
            </View>
          ))}
          <View
            style={[styles.inputWrap, inputFocused && styles.inputWrapFocused]}
          >
            <TextInput
              ref={inputRef}
              style={styles.input}
              placeholder={
                selectedPaper ? "Ask about this paper…" : "Ask Eduraa…"
              }
              placeholderTextColor={colors.placeholder}
              value={input}
              onChangeText={setInput}
              multiline
              maxLength={2000}
              returnKeyType="default"
              onFocus={() => setInputFocused(true)}
              onBlur={() => setInputFocused(false)}
            />
            <View style={styles.composerTools}>
              <TouchableOpacity
                style={styles.composerTool}
                onPress={() => setShowAttachments(true)}
                accessibilityLabel="Attach context"
              >
                <Ionicons name="add" size={19} color={colors.ink} />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.composerTool}
                onPress={() => setShowContext(true)}
                accessibilityLabel="Open context and memory"
              >
                <Ionicons name="options-outline" size={18} color={colors.ink} />
              </TouchableOpacity>
              <View style={{ flex: 1 }} />
              <TouchableOpacity
                style={[
                  styles.sendBtn,
                  (canSend || loading) && styles.sendBtnActive,
                ]}
                onPress={loading ? stopGeneration : () => sendMessage()}
                disabled={!canSend && !loading}
                activeOpacity={0.82}
                accessibilityLabel={
                  loading ? "Stop generating" : "Send message"
                }
              >
                <Ionicons
                  name={loading ? "stop" : "arrow-up"}
                  size={17}
                  color={canSend || loading ? colors.white : colors.subtle}
                />
              </TouchableOpacity>
            </View>
          </View>
          {composerError ? (
            <Text style={styles.composerError}>{composerError}</Text>
          ) : null}
          {input.length > 200 && (
            <Text style={styles.charCount}>{input.length}/2000</Text>
          )}
          <Text style={styles.disclaimer}>
            Eduraa AI can make mistakes. Verify important info.
          </Text>
        </View>
      </KeyboardAvoidingView>

      {/* History panel */}
      <HistoryPanel
        visible={showHistory}
        onClose={() => setShowHistory(false)}
        onSelect={loadConversation}
        onNewChat={startNewChat}
        onDeleted={(deletedConversationId) => {
          if (deletedConversationId === conversationId) startNewChat();
        }}
        activeConvId={conversationId}
      />

      <AttachmentSheet
        visible={showAttachments}
        onClose={() => setShowAttachments(false)}
        selectedPaper={selectedPaper}
        onSelectPaper={attachPaper}
        localAttachments={localAttachments}
        onAddLocal={addLocalAttachment}
        onRemoveLocal={removeLocalAttachment}
      />

      <ContextSheet
        visible={showContext}
        onClose={() => setShowContext(false)}
        conversationId={conversationId}
        profileRows={profileRows}
      />

      {notice ? (
        <View
          style={[styles.notice, { bottom: Math.max(insets.bottom, 12) + 86 }]}
          pointerEvents="none"
        >
          <Ionicons name="checkmark-circle" size={16} color={colors.white} />
          <Text style={styles.noticeText}>{notice}</Text>
        </View>
      ) : null}
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#FBF6EC" },
  kav: { flex: 1 },

  // Top bar
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing[3],
    paddingBottom: spacing[3],
    backgroundColor: "#FBF6EC",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  topBtn: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#DCCFBE",
    backgroundColor: colors.white,
  },
  topActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[1],
  },
  topCenter: { flex: 1, alignItems: "center", gap: 3 },
  topTitle: {
    maxWidth: "82%",
    fontSize: 15,
    fontWeight: "700",
    fontFamily: fonts.displaySemibold,
    color: "#07152D",
  },
  onlinePill: { flexDirection: "row", alignItems: "center", gap: 4 },
  onlineDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.success,
  },
  offlineDot: { backgroundColor: colors.danger },
  onlineText: {
    maxWidth: "88%",
    fontSize: 10,
    color: colors.success,
    fontFamily: fonts.semibold,
  },
  offlineText: { color: colors.dangerText },

  // Messages
  messageList: { padding: spacing[4], paddingBottom: spacing[3] },
  messageListEmpty: { flexGrow: 1, padding: 0 },
  contextStrip: {
    minHeight: 42,
    marginBottom: spacing[5],
    paddingVertical: spacing[2],
    paddingRight: spacing[3],
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[2],
    borderBottomWidth: 1,
    borderBottomColor: "#DCCFBE",
  },
  contextAccent: {
    width: 3,
    alignSelf: "stretch",
    borderRadius: 2,
    backgroundColor: colors.accent,
  },
  contextStripText: {
    flex: 1,
    color: colors.textSecondary,
    fontSize: 10,
    lineHeight: 15,
    fontFamily: fonts.semibold,
  },

  loadingCenter: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing[3],
  },
  loadingText: { fontSize: 14, color: colors.muted },

  generationState: { marginTop: spacing[3], gap: spacing[2] },
  generationMeta: {
    paddingLeft: 54,
    paddingRight: spacing[4],
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing[3],
  },
  generationText: {
    flex: 1,
    fontSize: 11,
    color: colors.muted,
    fontFamily: fonts.medium,
  },
  stopButton: {
    minHeight: 32,
    paddingHorizontal: spacing[3],
    borderRadius: radius.full,
    backgroundColor: colors.ink,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing[1],
  },
  stopButtonText: { color: colors.white, fontSize: 11, fontFamily: fonts.bold },
  failureCard: {
    marginTop: spacing[4],
    marginHorizontal: spacing[4],
    padding: spacing[4],
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.dangerBorder,
    backgroundColor: colors.dangerBg,
    flexDirection: "row",
    gap: spacing[3],
  },
  failureIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.lg,
    backgroundColor: colors.white,
    alignItems: "center",
    justifyContent: "center",
  },
  failureCopy: { flex: 1, gap: spacing[1] },
  failureTitle: { color: colors.ink, fontSize: 14, fontFamily: fonts.bold },
  failureText: {
    color: colors.dangerText,
    fontSize: 12,
    lineHeight: 18,
    fontFamily: fonts.regular,
  },
  recoveryActions: {
    marginTop: spacing[2],
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: spacing[2],
  },
  retryButton: {
    alignSelf: "flex-start",
    minHeight: 36,
    paddingHorizontal: spacing[3],
    borderRadius: radius.full,
    backgroundColor: colors.ink,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[2],
  },
  retryButtonText: {
    color: colors.white,
    fontSize: 12,
    fontFamily: fonts.bold,
  },
  copyPartialButton: {
    minHeight: 40,
    paddingHorizontal: spacing[2],
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[1],
  },
  copyPartialText: {
    color: colors.dangerText,
    fontSize: 11,
    fontFamily: fonts.bold,
  },

  // Input bar
  inputBar: {
    paddingHorizontal: spacing[4],
    paddingTop: spacing[3],
    backgroundColor: "#FFFDF8",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  inputBarFocused: {
    borderTopColor: colors.accentMid,
  },
  inputWrap: {
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: "#DCCFBE",
    backgroundColor: colors.white,
    paddingHorizontal: spacing[3],
    paddingTop: spacing[2],
    paddingBottom: spacing[2],
    minHeight: 94,
  },
  inputWrapFocused: {
    borderColor: colors.accent,
    backgroundColor: colors.card,
  },
  input: {
    width: "100%",
    minHeight: 38,
    fontSize: 15,
    fontFamily: fonts.regular,
    color: colors.ink,
    maxHeight: 130,
    paddingTop: Platform.OS === "ios" ? 8 : 4,
    paddingBottom: Platform.OS === "ios" ? 8 : 4,
    lineHeight: 22,
  },
  composerTools: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[1],
  },
  composerTool: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    backgroundColor: colors.surface3,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  sendBtnActive: { backgroundColor: colors.accent },
  attachmentContext: {
    minHeight: 54,
    marginBottom: spacing[2],
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[2],
    borderLeftWidth: 3,
    borderLeftColor: colors.accent,
    backgroundColor: "#FFF0E5",
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[2],
  },
  localAttachmentContext: {
    borderLeftColor: colors.danger,
    backgroundColor: colors.dangerBg,
  },
  attachmentContextIcon: {
    width: 34,
    height: 34,
    borderRadius: radius.sm,
    backgroundColor: colors.white,
    alignItems: "center",
    justifyContent: "center",
  },
  attachmentContextLabel: {
    color: colors.accentStrong,
    fontSize: 8,
    fontFamily: fonts.extrabold,
    letterSpacing: 0.8,
  },
  attachmentContextTitle: {
    color: "#07152D",
    fontSize: 11,
    fontFamily: fonts.bold,
    marginTop: 1,
  },
  attachmentRemove: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  composerError: {
    color: colors.dangerText,
    fontSize: 10,
    lineHeight: 15,
    fontFamily: fonts.medium,
    marginTop: spacing[2],
  },
  charCount: {
    textAlign: "right",
    fontSize: 10,
    color: colors.subtle,
    marginTop: 3,
  },
  disclaimer: {
    textAlign: "center",
    fontSize: 10,
    color: colors.subtle,
    marginTop: spacing[2],
    marginBottom: spacing[1],
  },
  notice: {
    position: "absolute",
    alignSelf: "center",
    minHeight: 42,
    paddingHorizontal: spacing[4],
    borderRadius: radius.full,
    backgroundColor: "#07152D",
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[2],
    ...shadows.md,
  },
  noticeText: { color: colors.white, fontSize: 12, fontFamily: fonts.bold },
});
