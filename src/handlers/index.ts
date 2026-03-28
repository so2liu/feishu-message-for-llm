import type { MessageHandler } from "../types.js";
import { handleAudio } from "./audio.js";
import { handleCalendar } from "./calendar.js";
import { handleFile } from "./file.js";
import { handleFolder } from "./folder.js";
import { handleHongbao } from "./hongbao.js";
import { handleImage } from "./image.js";
import { handleInteractive } from "./interactive.js";
import { handleLocation } from "./location.js";
import { handleMedia } from "./media.js";
import { handleMergeForward } from "./merge-forward.js";
import { handlePost } from "./post.js";
import { handleShareChat } from "./share-chat.js";
import { handleShareUser } from "./share-user.js";
import { handleSticker } from "./sticker.js";
import { handleSystem } from "./system.js";
import { handleText } from "./text.js";
import { handleTodo } from "./todo.js";
import { handleUnknown } from "./unknown.js";
import { handleVideoChat } from "./video-chat.js";
import { handleVote } from "./vote.js";

const handlers: Record<string, MessageHandler> = {
  text: handleText,
  post: handlePost,
  image: handleImage,
  file: handleFile,
  folder: handleFolder,
  audio: handleAudio,
  media: handleMedia,
  sticker: handleSticker,
  share_chat: handleShareChat,
  share_user: handleShareUser,
  merge_forward: handleMergeForward,
  interactive: handleInteractive,
  hongbao: handleHongbao,
  location: handleLocation,
  share_calendar_event: handleCalendar,
  calendar: handleCalendar,
  general_calendar: handleCalendar,
  video_chat: handleVideoChat,
  todo: handleTodo,
  vote: handleVote,
  system: handleSystem,
};

export function getHandler(messageType: string): MessageHandler {
  return handlers[messageType] ?? handleUnknown;
}
