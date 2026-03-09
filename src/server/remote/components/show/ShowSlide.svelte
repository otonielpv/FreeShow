<script lang="ts">
    import { onMount } from "svelte"
    import { getGroupName } from "../../../common/util/show"
    import { activeShow, mediaCache } from "../../util/stores"
    import Textbox from "./Textbox.svelte"
    import Zoomed from "./Zoomed.svelte"

    export let slide: any
    export let media: any
    export let layoutSlide: any
    export let color: string | null = slide.color
    export let index: number
    export let columns: number = 1
    export let active: boolean = false
    export let resolution: any
    export let renderBackground: boolean = true
    export let thumbnailOnly: boolean = false
    export let enableVisibilityRender: boolean = false

    let ratio = 0
    let slideElem: HTMLDivElement | null = null
    let isNearViewport = false

    $: isCustomRes = resolution.width !== 1920 || resolution.height !== 1080
    // WIP get layout resolution
    // $: slideResolution = slide?.settings?.resolution
    $: newResolution = isCustomRes ? resolution : { width: 1920, height: 1080 }

    $: name = $activeShow ? getGroupName({ show: $activeShow, showId: $activeShow.id || "" }, layoutSlide.id, slide.group, index) || slide.group || "" : ""

    $: backgroundMedia = media?.[layoutSlide?.background || ""] || null
    $: backgroundPath = backgroundMedia?.path || ""
    $: backgroundSourcePath = backgroundMedia?.id || backgroundPath
    $: backgroundIsCachedPath = backgroundPath.includes("freeshow-cache") || backgroundPath.includes("media-cache")
    $: shouldRenderNow = renderBackground && (!enableVisibilityRender || isNearViewport || active)
    $: backgroundImage = !shouldRenderNow ? "" : backgroundIsCachedPath ? $mediaCache[backgroundSourcePath] || "" : backgroundPath

    onMount(() => {
        if (!enableVisibilityRender || !slideElem || typeof IntersectionObserver === "undefined") {
            isNearViewport = true
            return
        }

        const observer = new IntersectionObserver(
            (entries) => {
                const entry = entries[0]
                if (!entry) return
                isNearViewport = entry.isIntersecting
            },
            {
                root: null,
                rootMargin: "250px 0px",
                threshold: 0.01
            }
        )

        observer.observe(slideElem)
        return () => observer.disconnect()
    })

    // Thumbnail requests are handled centrally in Slides.svelte to avoid request bursts on iOS.
</script>

<!-- TODO: disabled -->
<!-- https://svelte.dev/repl/3bf15c868aa94743b5f1487369378cf3?version=3.21.0 -->
<!-- animate:flip -->
<!-- class:right={overIndex === index && (!selected.length || index > selected[0])}
class:left={overIndex === index && (!selected.length || index <= selected[0])} -->
<div class="main" style="width: {100 / columns}%" bind:this={slideElem}>
    <div class="slide context #slide" class:disabled={layoutSlide.disabled} class:active style="background-color: {color};" tabindex={0} data-index={index} on:click>
        <Zoomed resolution={newResolution} background={slide.settings?.color || (slide.items.length ? "black" : "transparent")} bind:ratio>
            <!-- class:ghost={!background} -->
            <div class="background" style="zoom: {1 / ratio}">
                {#if backgroundImage}
                    <img src={backgroundImage} loading="lazy" decoding="async" />
                {/if}
            </div>
            <!-- TODO: check if showid exists in shows -->
            {#if !thumbnailOnly}
                {#each slide.items as item}
                    <Textbox {item} />
                {/each}
            {/if}
        </Zoomed>
        <!-- TODO: BG: white, color: black -->
        <!-- style="width: {newResolution.width * zoom}px;" -->

        <div class="label" title={slide.group === null ? "" : name || "—"} style={`color: ${color};border-bottom: 2px solid ${color || "var(--primary-darkest)"};`}>
            <span style="position: absolute;display: contents;">{index + 1}</span>
            <span class="text">{slide.group === null ? "" : name || "—"}</span>
        </div>
    </div>
</div>

<style>
    .main {
        display: flex;
        position: relative;
        padding: 2px;
    }

    .slide {
        /* padding: 3px; */
        background-color: var(--primary);
        z-index: 0;
        outline-offset: 0;
        width: 100%;
        /* height: fit-content; */
        /* border: 2px solid var(--primary-lighter); */
    }
    .slide.active {
        /* outline: 2px solid var(--secondary);
    outline-offset: 4px; */
        outline: 3px solid var(--secondary);
        outline-offset: -1px;

        z-index: 2;
    }
    .slide.disabled {
        opacity: 0.2;
    }

    .background {
        width: 100%;
        height: 100%;
        position: absolute;
        top: 0;
    }
    /* .background.ghost {
    opacity: 0.4;
  } */
    .background :global(img) {
        width: 100%;
        height: 100%;
        object-fit: contain;
    }

    .label {
        position: relative;
        background-color: var(--primary-darkest);
        display: flex;
        padding: 5px;
        padding-bottom: 3px;
        font-size: 0.8em;
        font-weight: bold;
        align-items: center;
        /* opacity: 0.8; */
    }

    .label .text {
        width: 100%;
        margin: 0 15px;
        text-align: center;
        overflow-x: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
</style>
