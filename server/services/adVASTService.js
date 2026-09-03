/**
 * VAST/VMAP Service for NovaFlix Ad System
 * Generates VAST 4.0 and VMAP 1.0 compliant XML for IMA SDK integration
 */

function formatDuration(seconds) {
  const h = Math.floor(seconds / 3600).toString().padStart(2, '0');
  const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
  const s = Math.floor(seconds % 60).toString().padStart(2, '0');
  return `${h}:${m}:${s}`;
}

function escapeXml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&')
    .replace(/</g, '<')
    .replace(/>/g, '>')
    .replace(/"/g, '"')
    .replace(/'/g, '&apos;');
}

function getTrackingUrl(baseUrl, event, campaignId, placementId) {
  return `${baseUrl}/api/ads/track?event=${event}&campaign=${campaignId}&placement=${placementId}`;
}

function formatTimeOffset(seconds) {
  if (seconds === 0) return 'start';
  if (seconds < 0) return 'end';
  const h = Math.floor(seconds / 3600).toString().padStart(2, '0');
  const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
  const s = Math.floor(seconds % 60).toString().padStart(2, '0');
  return `${h}:${m}:${s}`;
}

/**
 * Build VAST 4.0 XML for a single ad
 */
export function buildVAST(campaign, placement, baseUrl = '') {
  const duration = formatDuration(placement.duration_seconds || 15);
  const clickUrl = placement.click_url || campaign.click_url || '#';
  const mediaType = campaign.creative_type === 'video' ? 'video/mp4' : 'image/jpeg';
  const mediaUrl = campaign.creative_url;
  const trackingBase = `${process.env.API_BASE_URL || 'http://localhost:3030'}/api/ads/track`;

  const trackingEvents = [
    { event: 'start', url: `${trackingBase}?event=start&campaign=${campaign.id}&placement=${placement.id}` },
    { event: 'firstQuartile', url: `${trackingBase}?event=firstQuartile&campaign=${campaign.id}&placement=${placement.id}` },
    { event: 'midpoint', url: `${trackingBase}?event=midpoint&campaign=${campaign.id}&placement=${placement.id}` },
    { event: 'thirdQuartile', url: `${trackingBase}?event=thirdQuartile&campaign=${campaign.id}&placement=${placement.id}` },
    { event: 'complete', url: `${trackingBase}?event=complete&campaign=${campaign.id}&placement=${placement.id}` },
    { event: 'mute', url: `${trackingBase}?event=mute&campaign=${campaign.id}&placement=${placement.id}` },
    { event: 'unmute', url: `${trackingBase}?event=unmute&campaign=${campaign.id}&placement=${placement.id}` },
    { event: 'pause', url: `${trackingBase}?event=pause&campaign=${campaign.id}&placement=${placement.id}` },
    { event: 'resume', url: `${trackingBase}?event=resume&campaign=${campaign.id}&placement=${placement.id}` },
    { event: 'fullscreen', url: `${trackingBase}?event=fullscreen&campaign=${campaign.id}&placement=${placement.id}` },
    { event: 'rewind', url: `${trackingBase}?event=rewind&campaign=${campaign.id}&placement=${placement.id}` },
    { event: 'skip', url: `${trackingBase}?event=skip&campaign=${campaign.id}&placement=${placement.id}` },
    { event: 'progress', url: `${trackingBase}?event=progress&campaign=${campaign.id}&placement=${placement.id}` },
  ];

  const trackingXml = trackingEvents.map(t => 
    `<Tracking event="${t.event}"><![CDATA[${t.url}]]></Tracking>`
  ).join('\n                    ');

  const isVideo = campaign.creative_type === 'video';
  const mediaType = campaign.creative_type === 'video' ? 'video/mp4' : 'image/jpeg';
  
  return `<?xml version="1.0" encoding="UTF-8"?>
<VAST version="4.0">
  <Ad id="${placement.id}">
    <InLine>
      <AdSystem version="1.0">NovaFlix Ad Server</AdSystem>
      <AdTitle>${escapeXml(campaign.advertiser_name)}</AdTitle>
      <Impression><![CDATA[http://localhost:3030/api/ads/track?event=impression&campaign=${campaign.id}&placement=${placement.id}]]></Impression>
      <Description>${escapeXml(campaign.advertiser_name)}</Description>
      <Advertiser>${escapeXml(campaign.advertiser_name)}</Advertiser>
      <Survey></Survey>
      <Error><![CDATA[http://localhost:3030/api/ads/track?event=error&campaign=${campaign.id}&placement=${placement.id}&error=[ERRORCODE]]]></Error>
      <Creatives>
        <Creative sequence="1" id="${placement.id}">
          <Linear>
            <Duration>${formatDuration(placement.duration_seconds || 15)}</Duration>
            <TrackingEvents>
${trackingXml}
            </TrackingEvents>
            <AdParameters>${escapeXml(JSON.stringify({ placement_id: placement.id, campaign_id: campaign.id }))}</AdParameters>
            <VideoClicks>
              <ClickThrough><![CDATA[${placement.click_url || campaign.click_url || '#'}]]></ClickThrough>
              <ClickTracking><![CDATA[http://localhost:3030/api/ads/track?event=click&campaign=${campaign.id}&placement=${placement.id}]]></ClickTracking>
            </VideoClicks>
            <MediaFiles>
              <MediaFile 
                delivery="progressive" 
                type="${campaign.creative_type === 'video' ? 'video/mp4' : 'image/jpeg'}"
                width="1920" 
                height="1080"
                bitrate="2000"
                scalable="true"
                maintainAspectRatio="true"
                codec="${campaign.creative_type === 'video' ? 'avc1.42E01E' : ''}"
              ><![CDATA[${campaign.creative_url}]]></MediaFile>
            </MediaFiles>
          </Linear>
          </Creative>
        </Creatives>
        <Extensions>
          <Extension type="novaflik_placement">
            <PlacementId>${placement.id}</PlacementId>
            <PositionType>${placement.position_type}</PlacementType>
            <CueTime>${placement.cue_time_seconds || 0}</CueTime>
            <IsUnskippable>${placement.is_unskippable ? 'true' : 'false'}</IsUnskippable>
            <SkipAfter>${placement.skip_after_seconds || 0}</SkipAfter>
            <WarningSeconds>${placement.warning_seconds || 10}</WarningSeconds>
            <AdPodPosition>${placement.ad_pod_position || 0}</AdPodPosition>
          </Extension>
        </Extensions>
      </InLine>
    </Ad>
  </VAST>`;
}

function escapeXml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&')
    .replace(/</g, '<')
    .replace(/>/g, '>')
    .replace(/"/g, '"')
    .replace(/'/g, '&apos;');
}

/**
 * Build VMAP 1.0 XML for ad scheduling
 */
export function buildVMAP(placements, contentId, baseUrl = '') {
  const preRolls = placements.filter(p => p.position_type === 'pre_roll');
  const midRolls = placements.filter(p => p.position_type === 'mid_roll');
  const postRolls = placements.filter(p => p.position_type === 'post_roll');

  let vmap = `<?xml version="1.0" encoding="UTF-8"?>
<vmap:VMAP xmlns:vmap="http://www.iab.net/vmap-1.0" version="1.0">`;

  // Pre-roll
  const preRoll = placements.find(p => p.position_type === 'pre_roll');
  if (preRoll) {
    vmap += `
  <vmap:AdBreak breakType="linear" breakId="preroll" timeOffset="start">
    <vmap:AdSource allowMultipleAds="true" followRedirects="true" id="${preRoll.campaign_id}">
      <vmap:AdTagURI templateType="vast4"><![CDATA[http://localhost:3030/api/ads/vast?campaign=${preRoll.campaign_id}&placement=${preRoll.id}]]></vmap:AdTagURI>
    </vmap:AdSource>
  </vmap:AdBreak>`;
  }

  // Mid-rolls - group into pods
  const midRolls = placements.filter(p => p.position_type === 'mid_roll').sort((a, b) => a.cue_time_seconds - b.cue_time_seconds);
  const pods = groupIntoAdPods(midRolls, 30 * 60, 60); // 30 min interval, 60s pods
  
  pods.forEach((pod, podIndex) => {
    const firstAd = pod[0];
    const timeOffset = formatTimeOffset(firstAd.cue_time_seconds);
    vmap += `
  <vmap:AdBreak breakType="linear" breakId="midroll-${podIndex}" timeOffset="${timeOffset}">
    <vmap:AdSource allowMultipleAds="true" followRedirects="true" id="pod-${podIndex}">`;
    
    pod.forEach((ad, adIndex) => {
      vmap += `
    <vmap:AdSource allowMultipleAds="true" followRedirects="true" id="${ad.campaign_id}-${adIndex}">
      <vmap:AdTagURI templateType="vast4"><![CDATA[http://localhost:3030/api/ads/vast?campaign=${ad.campaign_id}&placement=${ad.id}]]></vmap:AdTagURI>
    </vmap:AdSource>`;
    });
    
    vmap += `
  </vmap:AdSource>
  </vmap:AdBreak>`;
  });

  // Post-roll
  const postRoll = placements.find(p => p.position_type === 'post_roll');
  if (postRoll) {
    vmap += `
  <vmap:AdBreak breakType="linear" breakId="postroll" timeOffset="end">
    <vmap:AdSource allowMultipleAds="true" followRedirects="true" id="${postRoll.campaign_id}">
      <vmap:AdTagURI templateType="vast4"><![CDATA[http://localhost:3030/api/ads/vast?campaign=${postRoll.campaign_id}&placement=${postRoll.id}]]></vmap:AdTagURI>
    </vmap:AdSource>
  </vmap:AdBreak>`;
  }

  vmap += '\n</vmap:VMAP>';
  return vmap;
}

function formatTimeOffset(seconds) {
  if (seconds === 0) return 'start';
  const h = Math.floor(seconds / 3600).toString().padStart(2, '0');
  const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
  const s = Math.floor(seconds % 60).toString().padStart(2, '0');
  return `${h}:${m}:${s}`;
}

function groupIntoAdPods(midRolls, intervalSeconds, podDuration) {
  if (!midRolls.length) return [];
  
  const pods = [];
  let currentPod = [];
  let currentPodDuration = 0;
  const podDurationSeconds = 60; // 60 second pods
  
  midRolls.forEach(ad => {
    if (currentPodDuration + (ad.duration_seconds || 15) <= 60) {
      currentPod.push(ad);
      currentPodDuration += ad.duration_seconds || 15;
    } else {
      if (currentPod.length) {
        pods.push(currentPod);
      }
      currentPod = [ad];
      currentPodDuration = ad.duration_seconds || 15;
    }
  });
  
  if (currentPod.length) {
    pods.push(currentPod);
  }
  
  return pods;
}

export function buildVAST(campaign, placement) {
  // Simplified VAST generation - see above for full implementation
  // This is a placeholder for the actual implementation
  return `<?xml version="1.0" encoding="UTF-8"?>
<VAST version="4.0">
  <Ad id="${placement.id}">
    <InLine>
      <AdSystem>NovaFlix Ad Server</AdSystem>
      <AdTitle>${escapeXml(campaign.advertiser_name)}</AdTitle>
      <Impression><![CDATA[http://localhost:3030/api/ads/track?event=impression&campaign=${campaign.id}&placement=${placement.id}]]></Impression>
      <Creatives>
        <Creative sequence="1" id="${placement.id}">
          <Linear>
            <Duration>00:00:${(placement.duration_seconds || 15).toString().padStart(2, '0')}</Duration>
            <MediaFiles>
              <MediaFile delivery="progressive" type="video/mp4" width="1920" height="1080"><![CDATA[${campaign.creative_url}]]></MediaFile>
            </MediaFiles>
          </Linear>
        </Creative>
      </Creatives>
    </InLine>
  </Ad>
</VAST>`;
}

function escapeXml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&')
    .replace(/</g, '<')
    .replace(/>/g, '>')
    .replace(/"/g, '"')
    .replace(/'/g, '&apos;');
}