/**
 * Video paths for Deal or NOT game moments
 */

export const BANKER_CALL_VIDEOS = [
  "/videos/banker-call/BANKER_CALL_BESTvideoyet_toptierS_implementthisone.mp4",
  "/videos/banker-call/BANKER_CALL_tierS_usethisone5.mp4",
  "/videos/banker-call/BANKER_CALL_tierS_useit.mp4",
  "/videos/banker-call/BANKER_CALL_tierA_implementthisone2.mp4",
  "/videos/banker-call/BANKER_CALL_nospeech_tierA_usethisone.mp4",
  "/videos/banker-call/BANKER_CALL_funny_listencarefullyOKAAAY_tierA_usethisone4.mp4",
  "/videos/banker-call/BANKER_CALL_useable_noneglish_bankerfacereveal.mp4",
  "/videos/banker-call/bankeriscalling_useit.mp4",
  "/videos/banker-call/BANKER_CALL_needsediting_useableBUTnon_english_bankerfacereveal.mp4",
];

export const DEAL_VIDEOS = [
  "/videos/deal/DEAL_USEIT.mp4",
  "/videos/deal/DEAL_useit1.mp4",
  "/videos/deal/wifechanging_DEAL_useit.mp4",
  "/videos/deal/DEAL_lowquality_useable_tippi_hits_button.mp4",
];

export const NO_DEAL_VIDEOS = [
  "/videos/no-deal/nodeal_useit.mp4",
  "/videos/no-deal/nodeal_letsgoo_useit.mp4",
  "/videos/no-deal/nodeal_letsgoooooo_useit.mp4",
  "/videos/no-deal/spooooky_nodeal_useit.mp4",
  "/videos/no-deal/spookynodeal_funny_useit.mp4",
  "/videos/no-deal/NODEAL_sendit_use it.mp4",
];

export const INTRO_VIDEOS = [
  "/videos/intro/INTRO_funny_useit.mp4",
];

/**
 * Get a random video from an array
 */
export function getRandomVideo(videos: string[]): string | null {
  if (videos.length === 0) return null;
  return videos[Math.floor(Math.random() * videos.length)];
}
