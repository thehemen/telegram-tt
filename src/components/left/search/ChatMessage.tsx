import type { FC } from '../../../lib/teact/teact';
import React, { memo, useCallback } from '../../../lib/teact/teact';
import { getActions, withGlobal } from '../../../global';

import type {
  ApiChat, ApiUser, ApiMessage, ApiMessageOutgoingStatus, ApiPhoto,
} from '../../../api/types';
import type { AnimationLevel } from '../../../types';
import type { LangFn } from '../../../hooks/useLang';

import {
  getPrivateChatUserId,
  getMessageMediaHash,
  getMessageMediaThumbDataUri,
  getMessageVideo,
  getMessageRoundVideo,
  getMessageSticker,
  getMessageIsSpoiler,
} from '../../../global/helpers';
import { selectChat, selectUser, selectUserPhotoFromFullInfo } from '../../../global/selectors';
import buildClassName from '../../../util/buildClassName';
import { formatPastTimeShort } from '../../../util/dateFormat';
import { renderMessageSummary } from '../../common/helpers/renderMessageText';

import useMedia from '../../../hooks/useMedia';
import useLang from '../../../hooks/useLang';
import useSelectWithEnter from '../../../hooks/useSelectWithEnter';
import useAppLayout from '../../../hooks/useAppLayout';

import Avatar from '../../common/Avatar';
import ListItem from '../../ui/ListItem';
import Link from '../../ui/Link';
import FullNameTitle from '../../common/FullNameTitle';

import './ChatMessage.scss';

type OwnProps = {
  searchQuery?: string;
  message: ApiMessage;
  chatId: string;
};

type StateProps = {
  chat?: ApiChat;
  privateChatUser?: ApiUser;
  userProfilePhoto?: ApiPhoto;
  lastMessageOutgoingStatus?: ApiMessageOutgoingStatus;
  lastSyncTime?: number;
  animationLevel?: AnimationLevel;
};

const ChatMessage: FC<OwnProps & StateProps> = ({
  message,
  searchQuery,
  chatId,
  chat,
  privateChatUser,
  userProfilePhoto,
  animationLevel,
  lastSyncTime,
}) => {
  const { focusMessage } = getActions();

  const { isMobile } = useAppLayout();
  const mediaThumbnail = !getMessageSticker(message) ? getMessageMediaThumbDataUri(message) : undefined;
  const mediaBlobUrl = useMedia(getMessageMediaHash(message, 'micro'));
  const isRoundVideo = Boolean(getMessageRoundVideo(message));

  const handleClick = useCallback(() => {
    focusMessage({ chatId, messageId: message.id, shouldReplaceHistory: true });
  }, [chatId, focusMessage, message.id]);

  const lang = useLang();

  const buttonRef = useSelectWithEnter(handleClick);

  if (!chat) {
    return undefined;
  }

  return (
    <ListItem
      className="ChatMessage chat-item-clickable"
      ripple={!isMobile}
      onClick={handleClick}
      buttonRef={buttonRef}
    >
      <Avatar
        chat={chat}
        user={privateChatUser}
        userProfilePhoto={userProfilePhoto}
        isSavedMessages={privateChatUser?.isSelf}
        lastSyncTime={lastSyncTime}
        withVideo
        animationLevel={animationLevel}
      />
      <div className="info">
        <div className="info-row">
          <FullNameTitle
            peer={privateChatUser || chat}
            withEmojiStatus
            isSavedMessages={chatId === privateChatUser?.id && privateChatUser?.isSelf}
          />
          <div className="message-date">
            <Link className="date">
              {formatPastTimeShort(lang, message.date * 1000)}
            </Link>
          </div>

        </div>
        <div className="subtitle">
          <div className="message" dir="auto">
            {renderSummary(lang, message, mediaBlobUrl || mediaThumbnail, searchQuery, isRoundVideo)}
          </div>
        </div>
      </div>
    </ListItem>
  );
};

function renderSummary(
  lang: LangFn, message: ApiMessage, blobUrl?: string, searchQuery?: string, isRoundVideo?: boolean,
) {
  if (!blobUrl) {
    return renderMessageSummary(lang, message, undefined, searchQuery);
  }

  const isSpoiler = getMessageIsSpoiler(message);

  return (
    <span className="media-preview">
      <img
        src={blobUrl}
        alt=""
        className={
          buildClassName('media-preview--image', isRoundVideo && 'round', isSpoiler && 'media-preview-spoiler')
        }
      />
      {getMessageVideo(message) && <i className="icon icon-play" />}
      {renderMessageSummary(lang, message, true, searchQuery)}
    </span>
  );
}

export default memo(withGlobal<OwnProps>(
  (global, { chatId }): StateProps => {
    const chat = selectChat(global, chatId);
    if (!chat) {
      return {};
    }

    const privateChatUserId = getPrivateChatUserId(chat);
    const privateChatUser = privateChatUserId ? selectUser(global, privateChatUserId) : undefined;
    const userProfilePhoto = privateChatUser ? selectUserPhotoFromFullInfo(global, privateChatUser.id) : undefined;

    return {
      chat,
      lastSyncTime: global.lastSyncTime,
      animationLevel: global.settings.byKey.animationLevel,
      ...(privateChatUserId && {
        privateChatUser,
        userProfilePhoto,
      }),
    };
  },
)(ChatMessage));
