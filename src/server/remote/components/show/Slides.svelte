<script lang="ts">
    import { createEventDispatcher, onMount } from "svelte"
    import type { Resolution } from "../../../../types/Settings"
    import Center from "../../../common/components/Center.svelte"
    import { translate } from "../../util/helpers"
    import { GetLayout } from "../../util/output"
    import { send } from "../../util/socket"
    import { activeShow, mediaCache, outShow, styleRes } from "../../util/stores"
    import Slide from "./ShowSlide.svelte"

    export let outSlide: number | null
    export let dictionary: any
    export let columns: number = 2
    let resolution: Resolution = $styleRes || { width: 1920, height: 1080 }

    // $: id = $activeShow!.id
    // $: currentShow = $shows[$activeShow!.id]
    // $: layoutSlides = [$shows[$activeShow!.id].layouts[$shows[$activeShow!.id].settings.activeLayout].slides, GetLayout($activeShow!.id)][1]
    $: layoutSlides = GetLayout($activeShow, $activeShow?.settings?.activeLayout || "")

    // auto scroll
    export let scrollElem: HTMLElement | undefined
    let lastScrollId = "-1"
    $: {
        if (scrollElem?.querySelector(".grid") && outSlide !== null && $outShow?.id === $activeShow?.id) {
            let index = Math.max(0, outSlide)
            if (($outShow?.id || "") + index !== lastScrollId) {
                lastScrollId = ($outShow?.id || "") + index
                let offset = (scrollElem.querySelector(".grid")?.children[index] as HTMLElement)?.offsetTop - scrollElem.offsetTop - 4 - 50
                scrollElem.scrollTo(0, offset)
            }
        }
    }

    let dispatch = createEventDispatcher()
    function click(i: number) {
        dispatch("click", i)
    }

    // pinch zoom
    let scaling: boolean = false
    let initialDistance: number = 0
    let initialColumns: number = columns
    const touchstart = (e: any) => {
        if (e.touches.length === 2) {
            initialDistance = Math.hypot(e.touches[0].pageX - e.touches[1].pageX, e.touches[0].pageY - e.touches[1].pageY)
            initialColumns = columns
            scaling = true
        }
    }

    const margin = 150
    let scaled = 0
    const touchmove = (e: any) => {
        if (scaling) {
            e.preventDefault()
            let dist = Math.hypot(e.touches[0].pageX - e.touches[1].pageX, e.touches[0].pageY - e.touches[1].pageY)

            let newColumns = 1
            scaled = initialDistance / margin - dist / margin
            if (scaled < 0) newColumns = initialColumns + scaled
            else newColumns = initialColumns + scaled

            columns = Math.min(4, Math.max(1, Math.floor(newColumns)))
        }
    }
    const touchend = () => (scaling = false)

    // Sequential thumbnail preload to avoid iOS/WebKit request bursts.
    type PreloadTarget = {
        key: string
        sourcePath: string
        requiresThumbnail: boolean
    }

    let preloadTargets: PreloadTarget[] = []
    let preloadQueue: string[] = []
    let preloadReady = false
    let preloadIndex = 0
    let preloadWaitTicks = 0
    let currentPreloadPath = ""
    let preloadTimer: ReturnType<typeof setInterval> | null = null
    let preloadRetryCount: Record<string, number> = {}
    let preloadAbandoned = new Set<string>()
    const PRELOAD_TICK_MS = 120
    const PRELOAD_WAIT_TICKS = 90
    const PRELOAD_MAX_RETRIES = 3
    const REMOTE_THUMBNAIL_SIZE = 120
    const IOS_SLIDE_THUMBNAIL_TICK_MS = 160
    let iosImageMode = false
    let preloadShowId = ""
    let preloadLayoutId = "default"

    let backgroundRenderLimit = 3
    let backgroundRenderTimer: ReturnType<typeof setInterval> | null = null

    function getSlideThumbKey(index: number, showId = preloadShowId || $activeShow?.id || "", layoutId = preloadLayoutId || $activeShow?.settings?.activeLayout || "default") {
        return `slide-thumb:${showId}:${layoutId}:${index}`
    }

    function getSlideIndexFromThumbKey(key: string) {
        if (!key) return -1
        const index = parseInt(key.slice(key.lastIndexOf(":") + 1), 10)
        return Number.isFinite(index) ? index : -1
    }

    function isTargetResolved(target: PreloadTarget) {
        if (!target.sourcePath) return true
        if (!target.requiresThumbnail) return true
        if (preloadAbandoned.has(target.sourcePath)) return true
        return !!$mediaCache[target.sourcePath]
    }

    $: preloadLoadedCount = preloadTargets.filter((target) => isTargetResolved(target)).length

    function collectPreloadData() {
        const show = $activeShow
        if (!show) return { targets: [] as PreloadTarget[], queue: [] as string[] }

        preloadShowId = show.id || ""
        preloadLayoutId = show?.settings?.activeLayout || "default"

        const targets: PreloadTarget[] = []
        const queueSet = new Set<string>()

        layoutSlides.forEach((layoutSlide: any, index: number) => {
            if (iosImageMode) {
                const key = getSlideThumbKey(index, preloadShowId, preloadLayoutId)
                targets.push({
                    key,
                    sourcePath: key,
                    requiresThumbnail: true
                })
                queueSet.add(key)
                return
            }

            const bgMedia = show.media?.[layoutSlide?.background || ""]
            const bgPath = bgMedia?.path || ""
            const sourcePath = bgMedia?.id || bgPath || ""
            const requiresThumbnail = bgPath.includes("freeshow-cache") || bgPath.includes("media-cache")

            targets.push({
                key: String(layoutSlide?.id || targets.length),
                sourcePath,
                requiresThumbnail
            })

            if (requiresThumbnail && sourcePath) queueSet.add(sourcePath)
        })

        return { targets, queue: Array.from(queueSet) }
    }

    function resetPreload() {
        const data = collectPreloadData()
        preloadTargets = data.targets
        preloadQueue = data.queue
        preloadIndex = 0
        preloadWaitTicks = 0
        currentPreloadPath = ""
        preloadRetryCount = {}
        preloadAbandoned = new Set<string>()
        preloadReady = preloadTargets.length === 0 || preloadLoadedCount >= preloadTargets.length
        backgroundRenderLimit = Math.min(3, layoutSlides.length)

        if (preloadTimer) {
            clearInterval(preloadTimer)
            preloadTimer = null
        }

        if (backgroundRenderTimer) {
            clearInterval(backgroundRenderTimer)
            backgroundRenderTimer = null
        }

        if (layoutSlides.length > backgroundRenderLimit) {
            backgroundRenderTimer = setInterval(() => {
                backgroundRenderLimit = Math.min(layoutSlides.length, backgroundRenderLimit + 1)
                if (backgroundRenderLimit >= layoutSlides.length && backgroundRenderTimer) {
                    clearInterval(backgroundRenderTimer)
                    backgroundRenderTimer = null
                }
            }, 250)
        }

        if (!preloadReady) {
            preloadTimer = setInterval(runPreloadStep, iosImageMode ? IOS_SLIDE_THUMBNAIL_TICK_MS : PRELOAD_TICK_MS)
        }
    }

    function runPreloadStep() {
        if (preloadReady) return

        if (preloadLoadedCount >= preloadTargets.length) {
            preloadReady = true
            if (preloadTimer) {
                clearInterval(preloadTimer)
                preloadTimer = null
            }
            return
        }

        if (currentPreloadPath) {
            if ($mediaCache[currentPreloadPath]) {
                currentPreloadPath = ""
                preloadWaitTicks = 0
                return
            }

            preloadWaitTicks += 1
            if (preloadWaitTicks > PRELOAD_WAIT_TICKS) {
                const retryCount = preloadRetryCount[currentPreloadPath] || 0
                if (retryCount >= PRELOAD_MAX_RETRIES) {
                    preloadAbandoned.add(currentPreloadPath)
                } else {
                    preloadRetryCount[currentPreloadPath] = retryCount + 1
                    preloadQueue.push(currentPreloadPath)
                }

                currentPreloadPath = ""
                preloadWaitTicks = 0
            }
            return
        }

        while (preloadIndex < preloadQueue.length && ($mediaCache[preloadQueue[preloadIndex]] || preloadAbandoned.has(preloadQueue[preloadIndex]))) {
            preloadIndex += 1
        }

        if (preloadIndex >= preloadQueue.length) {
            preloadReady = true
            if (preloadTimer) {
                clearInterval(preloadTimer)
                preloadTimer = null
            }
            return
        }

        currentPreloadPath = preloadQueue[preloadIndex]
        preloadIndex += 1
        if (iosImageMode) {
            const index = getSlideIndexFromThumbKey(currentPreloadPath)
            if (!Number.isFinite(index) || index < 0) {
                currentPreloadPath = ""
                return
            }

            if (!preloadShowId) {
                currentPreloadPath = ""
                return
            }

            send("API:get_slide_thumbnail", {
                showId: preloadShowId,
                layoutId: preloadLayoutId,
                index,
                scale: 0.25
            })
            return
        }

        send("API:get_thumbnail", { path: currentPreloadPath, size: REMOTE_THUMBNAIL_SIZE })
    }

    $: if ($activeShow?.id && layoutSlides.length) {
        resetPreload()
    }

    onMount(() => {
        const ua = typeof navigator !== "undefined" ? navigator.userAgent || "" : ""
        const isIOS = /iPad|iPhone|iPod/.test(ua)
        const isIPadOS = /Macintosh/.test(ua) && typeof navigator !== "undefined" && (navigator as any).maxTouchPoints > 1
        iosImageMode = isIOS || isIPadOS

        if ($activeShow?.id && layoutSlides.length) resetPreload()

        if (!preloadReady && !preloadTimer) {
            preloadTimer = setInterval(runPreloadStep, iosImageMode ? IOS_SLIDE_THUMBNAIL_TICK_MS : PRELOAD_TICK_MS)
        }

        return () => {
            if (preloadTimer) clearInterval(preloadTimer)
            if (backgroundRenderTimer) clearInterval(backgroundRenderTimer)
        }
    })
</script>

<div class="grid" on:touchstart={touchstart} on:touchmove={touchmove} on:touchend={touchend}>
    {#if layoutSlides.length}
        {#each layoutSlides as slide, i (`${$activeShow?.id || "show"}-${slide.id || "slide"}-${i}`)}
            <Slide
                {resolution}
                media={$activeShow?.media}
                layoutSlide={slide}
                slide={$activeShow?.slides[slide.id]}
                index={i}
                color={slide.color}
                active={outSlide === i && $outShow?.id === $activeShow?.id}
                renderBackground={i < backgroundRenderLimit || outSlide === i}
                slideThumbnailKey={getSlideThumbKey(i)}
                thumbnailOnly={iosImageMode}
                {columns}
                on:click={() => {
                    // if (!$outLocked && !e.ctrlKey) {
                    //   outSlide.set({ id, index: i })
                    // }
                    click(i)
                }}
            />
        {/each}

        {#if !preloadReady}
            <div class="preload-status">{translate("remote.loading", $dictionary)} ({preloadLoadedCount}/{preloadTargets.length})</div>
        {/if}
    {:else}
        <Center faded>{translate("empty.slides", $dictionary)}</Center>
    {/if}
</div>

<style>
    /* .scroll {
    padding-bottom: 10px;
  } */

    .grid {
        display: flex;
        flex-wrap: wrap;
        /* gap: 10px; */
        padding: 5px;
        height: 100%;
        align-content: flex-start;
    }

    .preload-status {
        position: sticky;
        bottom: 8px;
        margin: 6px auto 0;
        padding: 4px 8px;
        font-size: 0.8em;
        border-radius: 6px;
        background: rgb(0 0 0 / 0.45);
        color: var(--text);
    }
</style>
