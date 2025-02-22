import type { FC } from '../../../lib/teact/teact';
import React, {
  memo, useEffect, useMemo, useRef,
} from '../../../lib/teact/teact';
import { getActions, getGlobal, withGlobal } from '../../../global';

import type { ApiChatFolder, ApiChatlistExportedInvite, ApiSession } from '../../../api/types';
import type { GlobalState } from '../../../global/types';
import type { FolderEditDispatch } from '../../../hooks/reducers/useFoldersReducer';
import type { LeftColumnContent, SettingsScreens } from '../../../types';
import type { MenuItemContextAction } from '../../ui/ListItem';
import type { TabWithProperties } from '../../ui/TabList';

import { ALL_FOLDER_ID } from '../../../config';
import { selectCanShareFolder, selectTabState } from '../../../global/selectors';
import { selectCurrentLimit } from '../../../global/selectors/limits';
import buildClassName from '../../../util/buildClassName';
import captureEscKeyListener from '../../../util/captureEscKeyListener';
import { captureEvents, SwipeDirection } from '../../../util/captureEvents';
import { MEMO_EMPTY_ARRAY } from '../../../util/memo';
import { IS_TOUCH_ENV } from '../../../util/windowEnvironment';
import { renderTextWithEntities } from '../../common/helpers/renderTextWithEntities';

import useDerivedState from '../../../hooks/useDerivedState';
import { useFolderManagerForUnreadCounters } from '../../../hooks/useFolderManager';
import useHistoryBack from '../../../hooks/useHistoryBack';
import useLang from '../../../hooks/useLang';
import useLastCallback from '../../../hooks/useLastCallback';
import useShowTransition from '../../../hooks/useShowTransition';

import StoryRibbon from '../../story/StoryRibbon';
import Transition from '../../ui/Transition';
import ChatList from './ChatList';

import styles from './ChatFolders.module.scss';

import iconAllChats36 from '../../../assets/icons/folders_all.png';
import iconAllChats72 from '../../../assets/icons/folders_all@2x.png';
import iconAllChats108 from '../../../assets/icons/folders_all@3x.png';
import iconFolder36 from '../../../assets/icons/folders_custom.png';
import iconFolder72 from '../../../assets/icons/folders_custom@2x.png';
import iconFolder108 from '../../../assets/icons/folders_custom@3x.png';

type OwnProps = {
  onSettingsScreenSelect: (screen: SettingsScreens) => void;
  foldersDispatch: FolderEditDispatch;
  onLeftColumnContentChange: (content: LeftColumnContent) => void;
  shouldHideFolderTabs?: boolean;
  isForumPanelOpen?: boolean;
};

type StateProps = {
  chatFoldersById: Record<number, ApiChatFolder>;
  folderInvitesById: Record<number, ApiChatlistExportedInvite[]>;
  orderedFolderIds?: number[];
  activeChatFolder: number;
  currentUserId?: string;
  shouldSkipHistoryAnimations?: boolean;
  maxFolders: number;
  maxChatLists: number;
  maxFolderInvites: number;
  hasArchivedChats?: boolean;
  hasArchivedStories?: boolean;
  archiveSettings: GlobalState['archiveSettings'];
  isStoryRibbonShown?: boolean;
  sessions?: Record<string, ApiSession>;
};

const SAVED_MESSAGES_HOTKEY = '0';
const FIRST_FOLDER_INDEX = 0;

const ChatFolders: FC<OwnProps & StateProps> = ({
  foldersDispatch,
  onSettingsScreenSelect,
  onLeftColumnContentChange,
  chatFoldersById,
  orderedFolderIds,
  activeChatFolder,
  currentUserId,
  isForumPanelOpen,
  shouldSkipHistoryAnimations,
  maxFolders,
  maxChatLists,
  shouldHideFolderTabs,
  folderInvitesById,
  maxFolderInvites,
  hasArchivedChats,
  hasArchivedStories,
  archiveSettings,
  isStoryRibbonShown,
  sessions,
}) => {
  const {
    loadChatFolders,
    setActiveChatFolder,
    openChat,
    openShareChatFolderModal,
    openDeleteChatFolderModal,
    openEditChatFolder,
    openLimitReachedModal,
  } = getActions();

  // We load the folder list on component mount
  useEffect(() => {
    loadChatFolders();
  }, []);

  // Show/hide story ribbon
  const {
    ref: storyRibbonRef,
    shouldRender: shouldRenderStoryRibbon,
    getIsClosing: getIsStoryRibbonClosing,
  } = useShowTransition({
    isOpen: isStoryRibbonShown,
    className: false,
    withShouldRender: true,
  });
  const isStoryRibbonClosing = useDerivedState(getIsStoryRibbonClosing);

  const lang = useLang();

  // We define an “All Chats” folder if needed
  const allChatsFolder: ApiChatFolder = useMemo(() => {
    return {
      id: ALL_FOLDER_ID,
      title: { text: orderedFolderIds?.[0] === ALL_FOLDER_ID ? lang('FilterAllChatsShort') : lang('FilterAllChats') },
      includedChatIds: MEMO_EMPTY_ARRAY,
      excludedChatIds: MEMO_EMPTY_ARRAY,
    };
  }, [orderedFolderIds, lang]);

  // Build the array of displayed folders
  const displayedFolders = useMemo(() => {
    if (!orderedFolderIds) return [];
    return orderedFolderIds
      .map((id) => (id === ALL_FOLDER_ID ? allChatsFolder : chatFoldersById[id]))
      .filter(Boolean);
  }, [chatFoldersById, allChatsFolder, orderedFolderIds]);

  // Active folder checks
  const allChatsFolderIndex = displayedFolders.findIndex((f) => f.id === ALL_FOLDER_ID);
  const isInAllChatsFolder = allChatsFolderIndex === activeChatFolder;
  const isInFirstFolder = FIRST_FOLDER_INDEX === activeChatFolder;

  // Retrieve unread counters
  const folderCountersById = useFolderManagerForUnreadCounters();

  // Build folder items (like “tabs”, but vertical)
  const folderItems = useMemo<TabWithProperties[]>(() => {
    return displayedFolders.map((folder, index) => {
      const { id, title, noTitleAnimations } = folder;
      const canShareFolder = id !== ALL_FOLDER_ID && selectCanShareFolder(getGlobal(), id);
      const contextActions: MenuItemContextAction[] = [];

      // share folder if possible
      if (canShareFolder) {
        contextActions.push({
          title: lang('FilterShare'),
          icon: 'link',
          handler: () => {
            // check chatlist limit
            const chatListCount = Object.values(chatFoldersById).reduce((acc, el) => acc + (el.isChatList ? 1 : 0), 0);
            if (chatListCount >= maxChatLists && !folder.isChatList) {
              openLimitReachedModal({
                limit: 'chatlistJoined',
              });
              return;
            }

            // check invites limit
            if (folderInvitesById[id]?.length >= maxFolderInvites) {
              openLimitReachedModal({
                limit: 'chatlistInvites',
              });
              return;
            }
            openShareChatFolderModal({ folderId: id });
          },
        });
      }

      // add edit/delete for user-created folders
      if (id !== ALL_FOLDER_ID) {
        contextActions.push({
          title: lang('FilterEdit'),
          icon: 'edit',
          handler: () => openEditChatFolder({ folderId: id }),
        }, {
          title: lang('FilterDelete'),
          icon: 'delete',
          destructive: true,
          handler: () => openDeleteChatFolderModal({ folderId: id }),
        });
      }

      // Example: store an icon name in folder.icon (if you add that field)
      // Otherwise, default to "folder"
      const iconName = folder.icon || 'folder';

      return {
        id,
        title: renderTextWithEntities({
          text: title.text,
          entities: title.entities,
          noCustomEmojiPlayback: noTitleAnimations,
        }),
        badgeCount: folderCountersById[id]?.chatsCount,
        isBadgeActive: Boolean(folderCountersById[id]?.notificationsCount),
        isBlocked: index > maxFolders - 1 && id !== ALL_FOLDER_ID, // out of free limit
        contextActions,
        // custom field for an icon:
        iconName,
      };
    });
  }, [
    displayedFolders, maxFolders, folderCountersById, lang, chatFoldersById, folderInvitesById,
    maxFolderInvites, maxChatLists,
  ]);

  // Switching active folder
  const handleSwitchFolder = useLastCallback((folderIndex: number) => {
    setActiveChatFolder({ activeChatFolder: folderIndex }, { forceOnHeavyAnimation: true });
  });

  // Prevent pointing at an out-of-range folder
  useEffect(() => {
    if (activeChatFolder >= folderItems.length && folderItems.length > 0) {
      setActiveChatFolder({ activeChatFolder: FIRST_FOLDER_INDEX });
    }
  }, [activeChatFolder, folderItems, setActiveChatFolder]);

  // Swipe gestures on mobile
  const transitionRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!IS_TOUCH_ENV || !folderItems.length || isForumPanelOpen) {
      return undefined;
    }

    return captureEvents(transitionRef.current!, {
      selectorToPreventScroll: '.chat-list',
      onSwipe: (e, direction) => {
        if (direction === SwipeDirection.Left) {
          handleSwitchFolder(Math.min(activeChatFolder + 1, folderItems.length - 1));
          return true;
        }
        if (direction === SwipeDirection.Right) {
          handleSwitchFolder(Math.max(0, activeChatFolder - 1));
          return true;
        }
        return false;
      },
    });
  }, [activeChatFolder, folderItems, isForumPanelOpen, handleSwitchFolder]);

  // Esc key => go back to the first folder
  const isNotInFirstFolderRef = useRef<boolean>(!isInFirstFolder);
  isNotInFirstFolderRef.current = !isInFirstFolder;
  useEffect(() => (isNotInFirstFolderRef.current ? captureEscKeyListener(() => {
    if (isNotInFirstFolderRef.current) {
      setActiveChatFolder({ activeChatFolder: FIRST_FOLDER_INDEX });
    }
  }) : undefined), [activeChatFolder, setActiveChatFolder]);

  // Support “go back” if not in first folder
  useHistoryBack({
    isActive: !isInFirstFolder,
    onBack: () => setActiveChatFolder({ activeChatFolder: FIRST_FOLDER_INDEX }, { forceOnHeavyAnimation: true }),
  });

  // Hotkeys (Ctrl+Shift+Digit)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.code.startsWith('Digit') && folderItems.length) {
        const match = e.code.match(/Digit(\d)/);
        if (!match) return;

        const digit = match[1];
        if (digit === SAVED_MESSAGES_HOTKEY) {
          // 0 => open saved messages
          if (currentUserId) {
            openChat({ id: currentUserId, shouldReplaceHistory: true });
          }
          e.preventDefault();
          return;
        }

        const folderIndex = Number(digit) - 1; // digit is 1-based
        if (folderIndex < folderItems.length) {
          handleSwitchFolder(folderIndex);
          e.preventDefault();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [currentUserId, folderItems, openChat, handleSwitchFolder]);

  // Transition placeholder if folder data is not loaded
  const { ref: placeholderRef, shouldRender: shouldRenderPlaceholder } = useShowTransition({
    isOpen: !orderedFolderIds,
    noMountTransition: true,
    withShouldRender: true,
  });

  // Render the chat list for the current folder
  function renderCurrentTab(isActive: boolean) {
    const folderId = folderItems[activeChatFolder]?.id;
    const isFolder = folderId !== ALL_FOLDER_ID;

    return (
      <ChatList
        folderType={isFolder ? 'folder' : 'all'}
        folderId={isFolder ? folderId : undefined}
        isActive={isActive}
        isForumPanelOpen={isForumPanelOpen}
        foldersDispatch={foldersDispatch}
        onSettingsScreenSelect={onSettingsScreenSelect}
        onLeftColumnContentChange={onLeftColumnContentChange}
        canDisplayArchive={(hasArchivedChats || hasArchivedStories) && !archiveSettings.isHidden}
        archiveSettings={archiveSettings}
        sessions={sessions}
      />
    );
  }

  function renderFolderItem(folder: TabWithProperties, index: number) {
    // isActive => class 'active'
    const isActive = (index === activeChatFolder);
    const isAllChats = (folder.id === ALL_FOLDER_ID);

    // Single PNG (e.g., 72×72)
    const singleSrc = isAllChats ? iconAllChats72 : iconFolder72;

    // Multiple sizes with srcSet
    const multiSrcSet = `
      ${isAllChats ? iconAllChats36 : iconFolder36} 1x,
      ${isAllChats ? iconAllChats72 : iconFolder72} 2x,
      ${isAllChats ? iconAllChats108 : iconFolder108} 3x
    `;

    return (
      <div
        key={folder.id}
        className={[
          styles['folder-item'],
          isActive && 'active', // or styles.active if you prefer
        ].filter(Boolean).join(' ')}
        onClick={() => handleSwitchFolder(index)}
      >
        <img
          src={singleSrc}
          srcSet={multiSrcSet}
          className={styles['folder-icon']}
          alt={isAllChats ? 'All Chats Icon' : 'Folder Icon'}
        />

        <div
          className={styles['folder-label']}
          title={folder.title} // This shows the full text on hover
        >
          {folder.title}
        </div>
        {folder.badgeCount && folder.badgeCount > 0 ? (
          <div className={styles.badge}>{folder.badgeCount}</div>
        ) : null}
      </div>
    );
  }

  return (
    <div
      ref={storyRibbonRef}
      className={buildClassName(
        styles.ChatFolders,
        shouldRenderStoryRibbon && 'with-story-ribbon',
        shouldHideFolderTabs && 'ChatFolders--tabs-hidden',
      )}
    >
      {/* Optionally render story ribbon */}
      {shouldRenderStoryRibbon && <StoryRibbon isClosing={isStoryRibbonClosing} />}
      {/* Folders sidebar */}
      {folderItems.length > 1 && !shouldHideFolderTabs ? (
        <div className={styles.ChatFolders__sidebar}>
          {folderItems.map((folder, i) => renderFolderItem(folder, i))}
        </div>
      ) : shouldRenderPlaceholder ? (
        <div ref={placeholderRef} className="tabs-placeholder" />
      ) : null}
      {/* Main chat content */}
      <div className={styles.ChatFolders__main}>
        <Transition
          ref={transitionRef}
          name={shouldSkipHistoryAnimations ? 'none' : lang.isRtl ? 'slideOptimizedRtl' : 'slideOptimized'}
          activeKey={activeChatFolder}
          renderCount={folderItems.length || 1}
        >
          {renderCurrentTab}
        </Transition>
      </div>
    </div>
  );
};

export default memo(withGlobal<OwnProps>(
  (global): StateProps => {
    const {
      chatFolders: {
        byId: chatFoldersById,
        orderedIds: orderedFolderIds,
        invites: folderInvitesById,
      },
      chats: {
        listIds: {
          archived,
        },
      },
      stories: {
        orderedPeerIds: {
          archived: archivedStories,
        },
      },
      activeSessions: {
        byHash: sessions,
      },
      currentUserId,
      archiveSettings,
    } = global;
    const { shouldSkipHistoryAnimations, activeChatFolder } = selectTabState(global);
    const { storyViewer: { isRibbonShown: isStoryRibbonShown } } = selectTabState(global);

    return {
      chatFoldersById,
      folderInvitesById,
      orderedFolderIds,
      activeChatFolder,
      currentUserId,
      shouldSkipHistoryAnimations,
      hasArchivedChats: Boolean(archived?.length),
      hasArchivedStories: Boolean(archivedStories?.length),
      maxFolders: selectCurrentLimit(global, 'dialogFilters'),
      maxFolderInvites: selectCurrentLimit(global, 'chatlistInvites'),
      maxChatLists: selectCurrentLimit(global, 'chatlistJoined'),
      archiveSettings,
      isStoryRibbonShown,
      sessions,
    };
  },
)(ChatFolders));
