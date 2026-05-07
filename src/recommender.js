function normalizeText(value) {
  return String(value || '').toLowerCase();
}

function isShort(video) {
  const duration = Number(video && video.duration);
  const webpageUrl = normalizeText(video && (video.webpage_url || video.webpageUrl));
  const url = normalizeText(video && video.url);
  return (
    (Number.isFinite(duration) && duration < 61) ||
    webpageUrl.includes('/shorts/') ||
    url.includes('/shorts/')
  );
}

function scoreVideo(video, config, history, subscriptions) {
  let score = 0;
  const interests = Array.isArray(config && config.interests) ? config.interests : [];
  const tags = Array.isArray(video && video.tags) ? video.tags : [];
  const title = normalizeText(video && video.title);
  const description = normalizeText(video && video.description);

  const interestMatches = interests.filter((interest) => {
    const needle = normalizeText(interest);
    return tags.some((tag) => normalizeText(tag).includes(needle)) ||
      title.includes(needle) ||
      description.includes(needle);
  });
  score += interestMatches.length * 3;

  const subList = Array.isArray(subscriptions) ? subscriptions : [];
  const isSubscribed = subList.some((sub) => sub.channelId && sub.channelId === video.channelId);
  if (isSubscribed) {
    score += 4;
  }

  const uploadTime = new Date(video.uploadDate || video.upload_date || 0).getTime();
  if (Number.isFinite(uploadTime) && uploadTime > 0) {
    const daysSinceUpload = (Date.now() - uploadTime) / (1000 * 60 * 60 * 24);
    if (daysSinceUpload < 1) {
      score += 5;
    } else if (daysSinceUpload < 7) {
      score += 3;
    } else if (daysSinceUpload < 30) {
      score += 1;
    }
  }

  const watchHistory = Array.isArray(history) ? history : [];
  const alreadyWatched = watchHistory.some((entry) => entry.videoId === video.videoId);
  if (alreadyWatched) {
    score -= 10;
  }

  const views = Number(video.views || video.view_count || 0);
  if (views > 1000000) {
    score += 2;
  } else if (views > 100000) {
    score += 1;
  }

  const channelWatchCount = watchHistory.filter((entry) => entry.channelId === video.channelId).length;
  score += Math.min(channelWatchCount, 3);

  return score;
}

function dedupeVideos(videos) {
  const byId = new Map();
  for (const video of Array.isArray(videos) ? videos : []) {
    if (!video || isShort(video)) {
      continue;
    }
    const key = video.videoId || video.id || video.webpage_url || video.webpageUrl || video.url;
    if (!key || byId.has(key)) {
      continue;
    }
    byId.set(key, video);
  }
  return Array.from(byId.values());
}

function feedbackSet(feedback, key) {
  return new Set(Array.isArray(feedback && feedback[key]) ? feedback[key].filter(Boolean).map(String) : []);
}

function isBlockedByFeedback(video, feedback = {}) {
  const hiddenIds = feedbackSet(feedback, 'hiddenChannelIds');
  const hiddenNames = feedbackSet(feedback, 'hiddenChannelNames');
  const channelId = String(video && video.channelId || '');
  const channelName = normalizeText(video && video.channelName);
  return (channelId && hiddenIds.has(channelId)) || (channelName && hiddenNames.has(channelName));
}

function applyFeedbackScore(video, feedback = {}) {
  let penalty = 0;
  const notInterested = feedbackSet(feedback, 'notInterestedVideoIds');
  const channelPenalties = feedback.channelPenalties && typeof feedback.channelPenalties === 'object'
    ? feedback.channelPenalties
    : {};
  if (video.videoId && notInterested.has(video.videoId)) {
    penalty += 25;
  }
  if (video.channelId && Number.isFinite(Number(channelPenalties[video.channelId]))) {
    penalty += Number(channelPenalties[video.channelId]);
  }
  return {
    ...video,
    score: (Number(video.score) || 0) - penalty
  };
}

function diversifyVideos(videos) {
  const groups = new Map();
  for (const video of Array.isArray(videos) ? videos : []) {
    const channelKey = video.channelId || video.channelName || video.videoId;
    if (!groups.has(channelKey)) {
      groups.set(channelKey, []);
    }
    groups.get(channelKey).push(video);
  }

  for (const group of groups.values()) {
    group.sort((a, b) => {
      if ((b.score || 0) !== (a.score || 0)) {
        return (b.score || 0) - (a.score || 0);
      }
      return new Date(b.uploadDate || 0).getTime() - new Date(a.uploadDate || 0).getTime();
    });
  }

  const uniqueChannels = groups.size;
  const perChannelSoftCap = uniqueChannels >= 10 ? 2 : uniqueChannels >= 5 ? 3 : 5;
  const overflow = [];
  for (const [channelKey, group] of groups.entries()) {
    if (group.length > perChannelSoftCap) {
      overflow.push(...group.splice(perChannelSoftCap));
      groups.set(channelKey, group);
    }
  }

  const orderedGroups = Array.from(groups.values())
    .sort((a, b) => ((b[0] && b[0].score) || 0) - ((a[0] && a[0].score) || 0));
  const diversified = [];
  let added = true;
  while (added) {
    added = false;
    for (const group of orderedGroups) {
      const next = group.shift();
      if (next) {
        diversified.push(next);
        added = true;
      }
    }
    orderedGroups.sort((a, b) => ((b[0] && b[0].score) || -Infinity) - ((a[0] && a[0].score) || -Infinity));
  }
  overflow.sort((a, b) => (b.score || 0) - (a.score || 0));
  return [...diversified, ...overflow];
}

function scoreAndSort(videos, config, history, subscriptions, feedback = {}) {
  return dedupeVideos(videos)
    .filter((video) => !isBlockedByFeedback(video, feedback))
    .map((video) => ({
      ...video,
      score: scoreVideo(video, config, history, subscriptions)
    }))
    .map((video) => applyFeedbackScore(video, feedback))
    .sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      return new Date(b.uploadDate || 0).getTime() - new Date(a.uploadDate || 0).getTime();
    });
}

module.exports = {
  isShort,
  scoreVideo,
  dedupeVideos,
  scoreAndSort,
  isBlockedByFeedback,
  diversifyVideos
};
