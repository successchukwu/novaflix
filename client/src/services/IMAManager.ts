// client/src/services/IMAManager.ts
// Google IMA SDK Manager for NovaFlix

declare global {
  interface Window {
    google: {
      ima: {
        AdsLoader: new () => google.ima.AdsLoader;
        AdsManager: new () => google.ima.AdsManager;
        AdsRenderingSettings: new () => google.ima.AdsRenderingSettings;
        AdDisplayContainer: new (container: HTMLElement, videoElement: HTMLVideoElement) => google.ima.AdDisplayContainer;
        AdsRequest: new () => google.ima.AdsRequest;
        AdErrorEvent: { TYPE: 'AD_ERROR'; AD_ERROR: 'adError' };
        AdEvent: {
          TYPE: 'AD_EVENT';
          LOADED: 'loaded';
          STARTED: 'started';
          COMPLETE: 'complete';
          SKIPPED: 'skipped';
          PAUSED: 'paused';
          RESUMED: 'resumed';
          FIRST_QUARTILE: 'firstQuartile';
          MIDPOINT: 'midpoint';
          THIRD_QUARTILE: 'thirdQuartile';
          CONTENT_PAUSE_REQUESTED: 'contentPauseRequested';
          CONTENT_RESUME_REQUESTED: 'contentResumeRequested';
          AD_PROGRESS: 'adProgress';
          CLICK: 'click';
          SKIPPED: 'skipped';
          IMPRESSION: 'impression';
        };
      };
    }
  }
}

export interface IMAManagerCallbacks {
  onAdBreakStart: () => void;
  onAdBreakEnd: () => void;
  onAdError: (error: Error) => void;
  onAdProgress: (data: {
    currentTime: number;
    duration: number;
    isSkippable: boolean;
    adPosition: number;
    totalAds: number;
  }) => void;
  onAdWarning: (message: string) => void;
}

interface IMAAd {
  isSkippable(): boolean;
  getDuration(): number;
  getCurrentTime(): number;
  getAdSystem(): string;
  getTitle(): string;
  getDescription(): string;
  getSurveyUrl(): string;
  getAdId(): string;
  getCreativeAdId(): string;
  getCreativeId(): string;
  getDealId(): string;
  getWrapperAdIds(): string[];
  getCreativeType(): string;
  getDuration(): number;
  getWidth(): number;
  getHeight(): number;
  getAdvertiserName(): string;
  getSurveyUrl(): string;
  getAdSystem(): string;
  getTitle(): string;
  getDescription(): string;
  getAdId(): string;
  getCreativeAdId(): string;
  getCreativeId(): string;
  getDealId(): string;
  getWrapperAdIds(): string[];
  getCreativeType(): string;
  getDuration(): number;
  getWidth(): number;
  getHeight(): number;
  getAdvertiserName(): string;
  getSurveyUrl(): string;
  getAdSystem(): string;
  getTitle(): string;
  getDescription(): string;
  getAdId(): string;
  getCreativeAdId(): string;
  getCreativeId(): string;
  getDealId(): string;
  getWrapperAdIds(): string[];
  getCreativeType(): string;
  getDuration(): number;
  getWidth(): number;
  getHeight(): number;
  isSkippable(): boolean;
  getCurrentTime(): number;
  getAdSystem(): string;
  getTitle(): string;
  getDescription(): string;
  getAdId(): string;
  getCreativeAdId(): string;
  getCreativeId(): string;
  getDealId(): string;
  getWrapperAdIds(): string[];
  getCreativeType(): string;
  getDuration(): number;
  getWidth(): number;
  getHeight(): number;
  getAdvertiserName(): string;
  getSurveyUrl(): string;
  getAdSystem(): string;
  getTitle(): string;
  getDescription(): string;
  getAdId(): string;
  getCreativeAdId(): string;
  getCreativeId(): string;
  getDealId(): string;
  getWrapperAdIds(): string[];
  getCreativeType(): string;
  getDuration(): number;
  getWidth(): number;
  getHeight(): number;
  getAdvertiserName(): string;
  getSurveyUrl(): string;
  getAdSystem(): string;
  getTitle(): string;
  getDescription(): string;
  getAdId(): string;
  getCreativeAdId(): string;
  getCreativeId(): string;
  getDealId(): string;
  getWrapperAdIds(): string[];
  getCreativeType(): string;
  getDuration(): number;
  getWidth(): number;
  getHeight(): number;
  getAdvertiserName(): string;
  getSurveyUrl(): string;
  getAdSystem(): string;
  getTitle(): string;
  getDescription(): string;
  getAdId(): string;
  getCreativeAdId(): string;
  getCreativeId(): string;
  getDealId(): string;
  getWrapperAdIds(): string[];
  getCreativeType(): string;
  getDuration(): number;
  getWidth(): number;
  getHeight(): number;
  getAdvertiserName(): string;
  getSurveyUrl(): string;
}

export class IMAManager {
  private adsLoader: google.ima.AdsLoader | null = null;
  private adsManager: google.ima.AdsManager | null = null;
  private adDisplayContainer: google.ima.AdDisplayContainer | null = null;
  private videoElement: HTMLVideoElement;
  private adContainer: HTMLElement;
  private contentCompleteCallback: (() => void) | null = null;
  private onAdBreakStart: () => void;
  private onAdBreakEnd: () => void;
  private onAdError: (error: Error) => void;
  private onAdProgress: (data: { currentTime: number; duration: number; isSkippable: boolean; adPosition: number; totalAds: number }) => void;
  private onAdWarning: (message: string) => void;
  private contentCompleteListener: (() => void) | null = null;
  private adBreakActive = false;
  private videoElement: HTMLVideoElement;
  private adContainer: HTMLElement;
  private contentId: string | null = null;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 3;

  constructor(
    videoElement: HTMLVideoElement,
    adContainer: HTMLElement,
    callbacks: {
      onAdBreakStart: () => void;
      onAdBreakEnd: () => void;
      onAdError: (error: Error) => void;
      onAdProgress: (data: { currentTime: number; duration: number; isSkippable: boolean; adPosition: number; totalAds: number }) => void;
      onAdWarning: (message: string) => void;
    }
  ) {
    this.videoElement = videoElement;
    this.adContainer = adContainer;
    this.onAdBreakStart = callbacks.onAdBreakStart;
    this.onAdBreakEnd = callbacks.onAdBreakEnd;
    this.onAdError = callbacks.onAdError;
    this.onAdProgress = callbacks.onAdProgress;
    this.onAdWarning = callbacks.onAdWarning;
  }

  async initialize(contentId: string): Promise<void> {
    this.contentId = contentId;
    
    // Load IMA SDK dynamically
    await this.loadIMASDK();
    
    // Create ad display container
    this.adDisplayContainer = new window.google.ima.AdDisplayContainer(
      this.adContainer,
      this.videoElement
    );
    
    // Create ads loader
    this.adsLoader = new window.google.ima.AdsLoader(this.adDisplayContainer);
    this.adsLoader.getSettings().setLocale('en');
    this.adsLoader.getSettings().setEnableBackgroundPlayback(true);
    this.adsLoader.getSettings().setAutoPlayAdBreaks(true);
    
    // Event listeners
    this.adsLoader.addEventListener(
      window.google.ima.AdsManagerLoadedEvent.Type.ADS_MANAGER_LOADED,
      (event: google.ima.AdsManagerLoadedEvent) => this.onAdsManagerLoaded(event),
      false
    );
    
    this.adsLoader.addEventListener(
      window.google.ima.AdErrorEvent.Type.AD_ERROR,
      (event: google.ima.AdErrorEvent) => this.onAdError(event),
      false
    );

    // Request ads using VMAP
    await this.requestAds();
  }

  private async loadIMASDK(): Promise<void> {
    if (window.google?.ima) return;
    
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://imasdk.googleapis.com/js/sdkloader/ima3.js';
      script.onload = resolve;
      script.onerror = () => reject(new Error('Failed to load IMA SDK'));
      document.head.appendChild(script);
    });
  }

  private async requestAds(): Promise<void> {
    if (!this.adsLoader || !this.contentId) return;
    
    // Request ads using VMAP URL
    const vmapUrl = `/api/ads/vmap?contentId=${this.contentId}`;
    const adsRequest = new window.google.ima.AdsRequest();
    adsRequest.adTagUrl = `/api/ads/vmap?contentId=${this.contentId}`;
    adsRequest.linearAdSlotWidth = this.videoElement.clientWidth;
    adsRequest.linearAdSlotHeight = this.videoElement.clientHeight;
    adsRequest.nonLinearAdSlotWidth = this.videoElement.clientWidth;
    adsRequest.nonLinearAdSlotHeight = this.videoElement.clientHeight / 3;
    
    this.adsLoader?.requestAds(adsRequest);
  }

  private onAdsManagerLoaded(event: google.ima.AdsManagerLoadedEvent): void {
    this.adsManager = event.getAdsManager(this.videoElement);
    
    // Listen to ad events
    this.adsManager.addEventListener(
      window.google.ima.AdEvent.Type.LOADED,
      () => this.onAdLoaded()
    );
    
    this.adsManager.addEventListener(
      window.google.ima.AdEvent.Type.STARTED,
      () => this.onAdStarted()
    );
    
    this.adsManager.addEventListener(
      window.google.ima.AdEvent.Type.COMPLETE,
      () => this.onAdComplete()
    );
    
    this.adsManager.addEventListener(
      window.google.ima.AdEvent.Type.SKIPPED,
      () => this.onAdSkipped()
    );
    
    this.adsManager.addEventListener(
      window.google.ima.AdEvent.Type.AD_PROGRESS,
      (event: google.ima.AdEvent) => this.onAdProgress(event)
    );
    
    this.adsManager.addEventListener(
      window.google.ima.AdEvent.Type.FIRST_QUARTILE,
      () => this.trackQuartile('firstQuartile')
    );
    
    this.adsManager.addEventListener(
      window.google.ima.AdEvent.Type.MIDPOINT,
      () => this.trackQuartile('midpoint')
    );
    
    this.adsManager.addEventListener(
      window.google.ima.AdEvent.Type.THIRD_QUARTILE,
      () => this.trackQuartile('thirdQuartile')
    );
    
    this.adsManager.addEventListener(
      window.google.ima.AdEvent.Type.PAUSED,
      () => this.onAdPaused()
    );
    
    this.adsManager.addEventListener(
      window.google.ima.AdEvent.Type.RESUMED,
      () => this.onAdResumed()
    );
    
    this.adsManager.addEventListener(
      window.google.ima.AdEvent.Type.CONTENT_PAUSE_REQUESTED,
      () => this.onContentPauseRequested()
    );
    
    this.adsManager.addEventListener(
      window.google.ima.AdEvent.Type.CONTENT_RESUME_REQUESTED,
      () => this.onContentResumeRequested()
    );

    // Initialize ads manager
    try {
      const initWidth = this.videoElement.clientWidth;
      const initHeight = this.videoElement.clientHeight;
      this.adsManager.init(this.videoElement.clientWidth, this.videoElement.clientHeight, window.google.ima.ViewMode.NORMAL);
    } catch (e) {
      console.error('IMA init error:', e);
    }
  }

  private onAdsManagerLoaded(event: google.ima.AdsManagerLoadedEvent): void {
    this.adsManager = event.getAdsManager(this.videoElement);
    
    // Listen to ad events
    this.adsManager.addEventListener(
      window.google.ima.AdEvent.Type.LOADED,
      () => this.onAdLoaded()
    );
    
    this.adsManager.addEventListener(
      window.google.ima.AdEvent.Type.STARTED,
      () => this.onAdStarted()
    );
    
    this.adsManager.addEventListener(
      window.google.ima.AdEvent.Type.COMPLETE,
      () => this.onAdComplete()
    );
    
    this.adsManager.addEventListener(
      window.google.ima.AdEvent.Type.SKIPPED,
      () => this.onAdSkipped()
    );
    
    this.adsManager.addEventListener(
      window.google.ima.AdEvent.Type.AD_PROGRESS,
      (event: google.ima.AdEvent) => this.onAdProgress(event)
    );
    
    this.adsManager.addEventListener(
      window.google.ima.AdEvent.Type.FIRST_QUARTILE,
      () => this.trackQuartile('firstQuartile')
    );
    
    this.adsManager.addEventListener(
      window.google.ima.AdEvent.Type.MIDPOINT,
      () => this.trackQuartile('midpoint')
    );
    
    this.adsManager.addEventListener(
      window.google.ima.AdEvent.Type.THIRD_QUARTILE,
      () => this.trackQuartile('thirdQuartile')
    );
    
    this.adsManager.addEventListener(
      window.google.ima.AdEvent.Type.PAUSED,
      () => this.onAdPaused()
    );
    
    this.adsManager.addEventListener(
      window.google.ima.AdEvent.Type.RESUMED,
      () => this.onAdResumed()
    );
    
    this.adsManager.addEventListener(
      window.google.ima.AdEvent.Type.CONTENT_PAUSE_REQUESTED,
      () => this.onContentPauseRequested()
    );
    
    this.adsManager.addEventListener(
      window.google.ima.AdEvent.Type.CONTENT_RESUME_REQUESTED,
      () => this.onContentResumeRequested()
    );

    // Initialize
    try {
      const initWidth = this.videoElement.clientWidth;
      const initHeight = this.videoElement.clientHeight;
      this.adsManager.init(this.videoElement.clientWidth, this.videoElement.clientHeight, window.google.ima.ViewMode.NORMAL);
    } catch (e) {
      console.error('IMA init error:', e);
    }
  }

  private onAdLoaded(): void {
    this.adBreakActive = true;
    this.onAdBreakStart();
  }

  private onAdStarted(): void {
    this.adBreakActive = true;
  }

  private onAdComplete(): void {
    this.adBreakActive = false;
    this.onAdBreakEnd();
  }

  private onAdSkipped(): void {
    this.onAdBreakEnd();
  }

  private onAdProgress(event: google.ima.AdEvent): void {
    const ad = this.adsManager?.getAd();
    if (ad) {
      const currentTime = this.adsManager?.getCurrentTime() || 0;
      const duration = ad.getDuration() || 0;
      const isSkippable = ad.isSkippable();
      this.onAdProgress({
        currentTime,
        duration,
        isSkippable,
        adPosition: 1,
        totalAds: 1
      });
    }
  }

  private onAdPaused(): void {
    // Ad paused - could track this
  }

  private onAdResumed(): void {
    // Ad resumed
  }

  private onContentPauseRequested(): void {
    const video = this.videoElement;
    if (video && !video.paused) {
      video.pause();
    }
  }

  private onContentResumeRequested(): void {
    const video = this.videoElement;
    if (video && video.paused) {
      video.play().catch(() => {});
    }
  }

  private onAdError(event: google.ima.AdErrorEvent): void {
    const error = new Error(event.getError().getMessage());
    this.onAdError(error);
    this.onAdBreakEnd(); // Fail gracefully - resume content
  }

  private trackQuartile(quartile: string): void {
    // Track quartile events for analytics
    console.log(`[IMA] Quartile: ${quartile}`);
  }

  private onAdLoaded(): void {
    this.adBreakActive = true;
    this.onAdBreakStart();
  }

  private onAdStarted(): void {
    this.adBreakActive = true;
  }

  private onAdComplete(): void {
    this.adBreakActive = false;
    this.onAdBreakEnd();
  }

  private onAdSkipped(): void {
    this.onAdBreakEnd();
  }

  private onAdProgress(event: google.ima.AdEvent): void {
    const ad = this.adsManager?.getAd();
    if (ad) {
      const currentTime = this.adsManager?.getCurrentTime() || 0;
      const duration = ad.getDuration() || 0;
      const isSkippable = ad.isSkippable();
      this.onAdProgress({
        currentTime,
        duration,
        isSkippable,
        adPosition: 1,
        totalAds: 1
      });
    }
  }

  private onAdPaused(): void {
    // Ad paused
  }

  private onAdResumed(): void {
    // Ad resumed
  }

  private onContentPauseRequested(): void {
    const video = this.videoElement;
    if (video && !video.paused) {
      video.pause();
    }
  }

  private onContentResumeRequested(): void {
    const video = this.videoElement;
    if (video && video.paused) {
      video.play().catch(() => {});
    }
  }

  private onAdError(event: google.ima.AdErrorEvent): void {
    const error = new Error(event.getError().getMessage());
    this.onAdError(error);
    this.onAdBreakEnd(); // Fail gracefully - resume content
  }

  private trackQuartile(quartile: string): void {
    console.log(`[IMA] Quartile: ${quartile}`);
  }

  // Public methods
  async initialize(contentId: string): Promise<void> {
    this.contentId = contentId;
    
    // Load IMA SDK dynamically
    await this.loadIMASDK();
    
    // Create ad display container
    this.adDisplayContainer = new window.google.ima.AdDisplayContainer(
      this.adContainer,
      this.videoElement
    );
    
    // Create ads loader
    this.adsLoader = new window.google.ima.AdsLoader(this.adDisplayContainer);
    this.adsLoader.getSettings().setLocale('en');
    this.adsLoader.getSettings().setEnableBackgroundPlayback(true);
    this.adsLoader.getSettings().setAutoPlayAdBreaks(true);
    
    // Event listeners
    this.adsLoader.addEventListener(
      window.google.ima.AdsManagerLoadedEvent.Type.ADS_MANAGER_LOADED,
      (event: google.ima.AdsManagerLoadedEvent) => this.onAdsManagerLoaded(event),
      false
    );
    
    this.adsLoader.addEventListener(
      window.google.ima.AdErrorEvent.Type.AD_ERROR,
      (event: google.ima.AdErrorEvent) => this.onAdError(event),
      false
    );

    // Request ads using VMAP
    await this.requestAds();
  }

  private async loadIMASDK(): Promise<void> {
    if (window.google?.ima) return;
    
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://imasdk.googleapis.com/js/sdkloader/ima3.js';
      script.onload = resolve;
      script.onerror = () => reject(new Error('Failed to load IMA SDK'));
      document.head.appendChild(script);
    });
  }

  private async requestAds(): Promise<void> {
    if (!this.adsLoader || !this.contentId) return;
    
    // Request ads using VMAP URL
    const vmapUrl = `/api/ads/vmap?contentId=${this.contentId}`;
    const adsRequest = new window.google.ima.AdsRequest();
    adsRequest.adTagUrl = `/api/ads/vmap?contentId=${this.contentId}`;
    adsRequest.linearAdSlotWidth = this.videoElement.clientWidth;
    adsRequest.linearAdSlotHeight = this.videoElement.clientHeight;
    adsRequest.nonLinearAdSlotWidth = this.videoElement.clientWidth;
    adsRequest.nonLinearAdSlotHeight = this.videoElement.clientHeight / 3;
    
    this.adsLoader?.requestAds(adsRequest);
  }

  // Public methods for external control
  pauseAd(): void {
    this.adsManager?.pause();
  }

  resumeAd(): void {
    this.adsManager?.resume();
  }

  skipAd(): void {
    if (this.adsManager && this.adsManager.getAd()?.isSkippable()) {
      this.adsManager.skip();
    }
  }

  destroy(): void {
    this.adsManager?.destroy();
    this.adsLoader?.destroy();
    this.adDisplayContainer?.destroy();
    this.adsManager = null;
    this.adsLoader = null;
    this.adDisplayContainer = null;
  }
}

export default IMAManager;