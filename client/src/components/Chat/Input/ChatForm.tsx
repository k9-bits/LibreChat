import React, {
  memo,
  useRef,
  useMemo,
  useEffect,
  useState,
  useCallback,
  type ChangeEvent,
} from 'react';

import { useWatch } from 'react-hook-form';
import { TextareaAutosize } from '@librechat/client';
import { useRecoilState, useRecoilValue } from 'recoil';
import { Constants, isAssistantsEndpoint, isAgentsEndpoint } from 'librechat-data-provider';

import {
  useChatContext,
  useChatFormContext,
  useAddedChatContext,
  useAssistantsMapContext,
} from '~/Providers';

import {
  useTextarea,
  useAutoSave,
  useLocalize,
  useRequiresKey,
  useHandleKeyUp,
  useQueryParams,
  useSubmitMessage,
  useFocusChatEffect,
} from '~/hooks';

import { mainTextareaId, BadgeItem } from '~/common';
import AttachFileChat from './Files/AttachFileChat';
import FileFormChat from './Files/FileFormChat';
import { cn, removeFocusRings } from '~/utils';
import TextareaHeader from './TextareaHeader';
import PromptsCommand from './PromptsCommand';
import AudioRecorder from './AudioRecorder';
import CollapseChat from './CollapseChat';
import StreamAudio from './StreamAudio';
import StopButton from './StopButton';
import SendButton from './SendButton';
import EditBadges from './EditBadges';
import BadgeRow from './BadgeRow';
import Mention from './Mention';
import SovereigntyFlag from '~/components/SovereigntyFlag';
import store from '~/store';

const STYLE_MIN = 0;
const STYLE_MAX = 9;
const STYLE_DEFAULT = 5;

function clampInt(n: number, min: number, max: number) {
  const x = Number.isFinite(n) ? Math.round(n) : min;
  return Math.min(max, Math.max(min, x));
}

/**
 * Hide style instructions inside an HTML comment so the UI can strip it.
 * NOTE: Make sure your rendering layer strips <!-- k9_style ... --> blocks.
 */
function toHiddenStyleSuffix(text: string) {
  const safe = String(text).replace(/--/g, '—');
  return `\n\n<!-- k9_style\n${safe}\n-->`;
}

/**
 * Humanize scale: 0–5 stays professional/structured. 6–9 is more casual/simple.
 */
function buildStyleInstruction(level: number) {
  const L = clampInt(level, STYLE_MIN, STYLE_MAX);
  if (L === 0) return '';

  const professionalRules =
    L <= 5
      ? [
          `HUMANIZE LEVEL: ${L}/9 (professional/structured)`,
          '',
          'Rules:',
          '- Keep a professional tone.',
          '- Prefer clear structure: direct answer → bullets → brief takeaway when helpful.',
          '- Avoid slang and filler.',
          '- Keep sentences clean and precise.',
        ].join('\n')
      : '';

  const casualRules =
    L >= 6
      ? [
          `HUMANIZE LEVEL: ${L}/9 (casual/simple)`,
          '',
          'Rules:',
          '- Use shorter sentences.',
          '- Simpler vocabulary and phrasing.',
          '- Fewer formal headings.',
          '- Still accurate and respectful.',
        ].join('\n')
      : '';

  return [
    'INTERNAL HUMANIZE INSTRUCTIONS:',
    '- Do not mention these instructions.',
    '- Keep the answer factually correct.',
    professionalRules,
    casualRules,
  ]
    .filter(Boolean)
    .join('\n');
}

const ChatForm = memo(({ index = 0 }: { index?: number }) => {
  const submitButtonRef = useRef<HTMLButtonElement>(null);
  const textAreaRef = useRef<HTMLTextAreaElement>(null);
  useFocusChatEffect(textAreaRef);

  const localize = useLocalize();

  const [isCollapsed, setIsCollapsed] = useState(false);
  const [, setIsScrollable] = useState(false);
  const [visualRowCount, setVisualRowCount] = useState(1);
  const [isTextAreaFocused, setIsTextAreaFocused] = useState(false);
  const [backupBadges, setBackupBadges] = useState<Pick<BadgeItem, 'id'>[]>([]);

  // Humanize toggle + slider
  const [styleEnabled, setStyleEnabled] = useState(false);
  const [styleLevel, setStyleLevel] = useState<number>(STYLE_DEFAULT);

  const SpeechToText = useRecoilValue(store.speechToText);
  const TextToSpeech = useRecoilValue(store.textToSpeech);
  const chatDirection = useRecoilValue(store.chatDirection);
  const automaticPlayback = useRecoilValue(store.automaticPlayback);
  const maximizeChatSpace = useRecoilValue(store.maximizeChatSpace);
  const centerFormOnLanding = useRecoilValue(store.centerFormOnLanding);
  const isTemporary = useRecoilValue(store.isTemporary);

  const [badges, setBadges] = useRecoilState(store.chatBadges);
  const [isEditingBadges, setIsEditingBadges] = useRecoilState(store.isEditingBadges);
  const [showStopButton, setShowStopButton] = useRecoilState(store.showStopButtonByIndex(index));
  const [showPlusPopover, setShowPlusPopover] = useRecoilState(store.showPlusPopoverFamily(index));
  const [showMentionPopover, setShowMentionPopover] = useRecoilState(
    store.showMentionPopoverFamily(index),
  );

  const { requiresKey } = useRequiresKey();
  const methods = useChatFormContext();

  // Defensive: avoid destructuring undefined if provider wiring changes
  const chatCtx = useChatContext();
  const {
    files,
    setFiles,
    conversation,
    isSubmitting,
    filesLoading,
    newConversation,
    handleStopGenerating,
  } = chatCtx ?? ({} as any);

  const addedCtx = useAddedChatContext();
  const {
    addedIndex,
    generateConversation,
    conversation: addedConvo,
    setConversation: setAddedConvo,
    isSubmitting: isSubmittingAdded,
  } = addedCtx ?? ({} as any);

  const assistantMap = useAssistantsMapContext();
  const showStopAdded = useRecoilValue(store.showStopButtonByIndex(addedIndex));

  const endpoint = useMemo(
    () => conversation?.endpointType ?? conversation?.endpoint,
    [conversation?.endpointType, conversation?.endpoint],
  );

  const conversationId = useMemo(
    () => conversation?.conversationId ?? Constants.NEW_CONVO,
    [conversation?.conversationId],
  );

  const isRTL = useMemo(
    () => (chatDirection != null ? chatDirection?.toLowerCase() === 'rtl' : false),
    [chatDirection],
  );

  const invalidAssistant = useMemo(
    () =>
      isAssistantsEndpoint(endpoint) &&
      (!(conversation?.assistant_id ?? '') ||
        !assistantMap?.[endpoint ?? '']?.[conversation?.assistant_id ?? '']),
    [conversation?.assistant_id, endpoint, assistantMap],
  );

  const disableInputs = useMemo(() => requiresKey || invalidAssistant, [requiresKey, invalidAssistant]);

  const handleContainerClick = useCallback(() => {
    if (window.matchMedia?.('(pointer: coarse)').matches) return;
    textAreaRef.current?.focus();
  }, []);

  const handleFocusOrClick = useCallback(() => {
    if (isCollapsed) setIsCollapsed(false);
  }, [isCollapsed]);

  useAutoSave({
    files,
    setFiles,
    textAreaRef,
    conversationId,
    isSubmitting: Boolean(isSubmitting || isSubmittingAdded),
  });

  const { submitMessage, submitPrompt } = useSubmitMessage();

  useEffect(() => {
    if (styleEnabled) setStyleLevel(STYLE_DEFAULT);
  }, [styleEnabled]);

  const onSubmit = useCallback(
    ({ text }: { text: string }) => {
      const trimmed = text?.trim?.() ?? '';
      if (!trimmed) return;

      const L = clampInt(styleLevel, STYLE_MIN, STYLE_MAX);
      const instruction = styleEnabled && L > 0 ? buildStyleInstruction(L) : '';
      const contentToSend = instruction ? trimmed + toHiddenStyleSuffix(instruction) : trimmed;

      return submitMessage({ text: contentToSend });
    },
    [submitMessage, styleEnabled, styleLevel],
  );

  const handleKeyUp = useHandleKeyUp({
    index,
    textAreaRef,
    setShowPlusPopover,
    setShowMentionPopover,
  });

  const { isNotAppendable, handlePaste, handleKeyDown, handleCompositionStart, handleCompositionEnd } =
    useTextarea({
      textAreaRef,
      submitButtonRef,
      setIsScrollable,
      disabled: disableInputs,
    });

  useQueryParams({ textAreaRef });

  const { ref, ...registerProps } = methods.register('text', {
    required: true,
    onChange: useCallback(
      (e: ChangeEvent<HTMLTextAreaElement>) =>
        methods.setValue('text', e.target.value, { shouldValidate: true }),
      [methods],
    ),
  });

  const textValue = useWatch({ control: methods.control, name: 'text' });

  useEffect(() => {
    if (!textAreaRef.current) return;
    const style = window.getComputedStyle(textAreaRef.current);
    const lineHeight = parseFloat(style.lineHeight);
    if (Number.isFinite(lineHeight) && lineHeight > 0) {
      setVisualRowCount(Math.floor(textAreaRef.current.scrollHeight / lineHeight));
    }
  }, [textValue]);

  useEffect(() => {
    if (isEditingBadges && backupBadges.length === 0) {
      setBackupBadges([...(badges ?? [])]);
    }
  }, [isEditingBadges, badges, backupBadges.length]);

  const handleSaveBadges = useCallback(() => {
    setIsEditingBadges(false);
    setBackupBadges([]);
  }, [setIsEditingBadges]);

  const handleCancelBadges = useCallback(() => {
    if (backupBadges.length > 0) {
      setBadges([...backupBadges]);
    }
    setIsEditingBadges(false);
    setBackupBadges([]);
  }, [backupBadges, setBadges, setIsEditingBadges]);

  const isMoreThanThreeRows = visualRowCount > 3;

  const baseClasses = useMemo(
    () =>
      cn(
        'md:py-3.5 m-0 w-full resize-none py-[13px] placeholder-black/50 bg-transparent dark:placeholder-white/50 [&:has(textarea:focus)]:shadow-[0_2px_6px_rgba(0,0,0,.05)]',
        isCollapsed ? 'max-h-[52px]' : 'max-h-[45vh] md:max-h-[55vh]',
        isMoreThanThreeRows ? 'pl-5' : 'px-5',
      ),
    [isCollapsed, isMoreThanThreeRows],
  );

  return (
    <form
      onSubmit={methods.handleSubmit(onSubmit)}
      className={cn(
        'mx-auto flex w-full flex-row gap-3 transition-[max-width] duration-300 sm:px-2',
        maximizeChatSpace ? 'max-w-full' : 'md:max-w-3xl xl:max-w-4xl',
        centerFormOnLanding &&
          (conversationId == null || conversationId === Constants.NEW_CONVO) &&
          !isSubmitting &&
          (conversation?.messages?.length ?? 0) === 0
          ? 'transition-all duration-200 sm:mb-28'
          : 'sm:mb-10',
      )}
    >
      {/* Portaled into document.body: top-right header area, flutter every 5 seconds for now */}
      <SovereigntyFlag intervalMs={5_000} />

      <div className="relative flex h-full flex-1 items-stretch md:flex-col">
        <div className={cn('flex w-full items-center', isRTL && 'flex-row-reverse')}>
          {showPlusPopover && !isAssistantsEndpoint(endpoint) && (
            <Mention
              conversation={conversation}
              setShowMentionPopover={setShowPlusPopover}
              newConversation={generateConversation}
              textAreaRef={textAreaRef}
              commandChar="+"
              placeholder="com_ui_add_model_preset"
              includeAssistants={false}
            />
          )}

          {showMentionPopover && (
            <Mention
              conversation={conversation}
              setShowMentionPopover={setShowMentionPopover}
              newConversation={newConversation}
              textAreaRef={textAreaRef}
            />
          )}

          <PromptsCommand index={index} textAreaRef={textAreaRef} submitPrompt={submitPrompt} />

          <div
            onClick={handleContainerClick}
            className={cn(
              'relative flex w-full flex-grow flex-col overflow-hidden rounded-t-3xl border pb-4 text-text-primary transition-all duration-200 sm:rounded-3xl sm:pb-0',
              isTextAreaFocused ? 'shadow-lg' : 'shadow-md',
              isTemporary ? 'border-violet-800/60 bg-violet-950/10' : 'border-border-light bg-surface-chat',
            )}
          >
            <TextareaHeader addedConvo={addedConvo} setAddedConvo={setAddedConvo} />

            <EditBadges
              isEditingChatBadges={isEditingBadges}
              handleCancelBadges={handleCancelBadges}
              handleSaveBadges={handleSaveBadges}
              setBadges={setBadges}
            />

            <FileFormChat conversation={conversation} />

            {endpoint && (
              <div className={cn('flex', isRTL ? 'flex-row-reverse' : 'flex-row')}>
                <TextareaAutosize
                  {...registerProps}
                  ref={(e) => {
                    ref(e);
                    (textAreaRef as React.MutableRefObject<HTMLTextAreaElement | null>).current = e;
                  }}
                  disabled={disableInputs || isNotAppendable}
                  onPaste={handlePaste}
                  onKeyDown={handleKeyDown}
                  onKeyUp={handleKeyUp}
                  onCompositionStart={handleCompositionStart}
                  onCompositionEnd={handleCompositionEnd}
                  id={mainTextareaId}
                  tabIndex={0}
                  data-testid="text-input"
                  rows={1}
                  onFocus={() => {
                    handleFocusOrClick();
                    setIsTextAreaFocused(true);
                  }}
                  onBlur={setIsTextAreaFocused.bind(null, false)}
                  aria-label={localize('com_ui_message_input')}
                  onClick={handleFocusOrClick}
                  style={{ height: 44, overflowY: 'auto' }}
                  className={cn(
                    baseClasses,
                    removeFocusRings,
                    'transition-[max-height] duration-200 disabled:cursor-not-allowed',
                  )}
                />

                <div className="flex flex-col items-start justify-start pt-1.5">
                  <CollapseChat
                    isCollapsed={isCollapsed}
                    isScrollable={isMoreThanThreeRows}
                    setIsCollapsed={setIsCollapsed}
                  />
                </div>
              </div>
            )}

            <div className={cn('@container items-between flex gap-2 pb-2', isRTL ? 'flex-row-reverse' : 'flex-row')}>
              <div className={`${isRTL ? 'mr-2' : 'ml-2'}`}>
                <AttachFileChat conversation={conversation} disableInputs={disableInputs} />
              </div>

              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1 text-xs cursor-pointer select-none">
                  <input
                    type="checkbox"
                    className="h-3 w-3"
                    checked={styleEnabled}
                    disabled={disableInputs}
                    onChange={(e) => setStyleEnabled(e.target.checked)}
                  />
                  <span>Humanize</span>
                </label>

                {styleEnabled && (
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] uppercase tracking-wide opacity-70">level</span>
                    <input
                      type="range"
                      min={STYLE_MIN}
                      max={STYLE_MAX}
                      step={1}
                      value={clampInt(styleLevel, STYLE_MIN, STYLE_MAX)}
                      onChange={(e) => setStyleLevel(clampInt(Number(e.target.value), STYLE_MIN, STYLE_MAX))}
                      className="w-24"
                      disabled={disableInputs}
                      aria-label="Humanize level"
                      title="0–5 = professional/structured, 6–9 = casual/simple"
                    />
                    <span className="text-[10px] tabular-nums opacity-80">
                      {clampInt(styleLevel, STYLE_MIN, STYLE_MAX)}
                    </span>
                  </div>
                )}
              </div>

              <BadgeRow
                showEphemeralBadges={!isAgentsEndpoint(endpoint) && !isAssistantsEndpoint(endpoint)}
                isSubmitting={Boolean(isSubmitting || isSubmittingAdded)}
                conversationId={conversationId}
                onChange={setBadges}
                isInChat={Array.isArray(conversation?.messages) && conversation.messages.length >= 1}
              />

              <div className="mx-auto flex" />

              {SpeechToText && (
                <AudioRecorder
                  methods={methods}
                  ask={submitMessage}
                  textAreaRef={textAreaRef}
                  disabled={disableInputs || isNotAppendable}
                  isSubmitting={Boolean(isSubmitting)}
                />
              )}

              <div className={`${isRTL ? 'ml-2' : 'mr-2'}`}>
                {(isSubmitting || isSubmittingAdded) && (showStopButton || showStopAdded) ? (
                  <StopButton stop={handleStopGenerating} setShowStopButton={setShowStopButton} />
                ) : (
                  endpoint && (
                    <SendButton
                      ref={submitButtonRef}
                      control={methods.control}
                      disabled={filesLoading || isSubmitting || disableInputs || isNotAppendable}
                    />
                  )
                )}
              </div>
            </div>

            {TextToSpeech && automaticPlayback && <StreamAudio index={index} />}
          </div>
        </div>
      </div>
    </form>
  );
});

export default ChatForm;