<script lang="ts">
    import { onMount } from "svelte"
    import Button from "../../../common/components/Button.svelte"
    import Loader from "../../../common/components/Loader.svelte"
    import { send } from "../../util/socket"
    import { mediaCache, outData, pdfPages } from "../../util/stores"

    export let active: any
    export let tablet: boolean = false

    $: path = active.id
    $: pages = $pdfPages[path] ? $pdfPages[path] : null
    $: visiblePages = pages ? pages.slice(0, loadedCount) : []

    let loading = true
    $: if (pages) loading = false
    else if (path) loading = true

    let loadedCount = 0
    const phoneBatchSize = 6
    const desktopBatchSize = 12
    const isPhone = window.matchMedia("(max-width: 1000px)").matches
    const batchSize = isPhone ? phoneBatchSize : desktopBatchSize

    $: if (pages && loadedCount === 0) loadedCount = Math.min(batchSize, pages.length)
    $: canLoadMore = !!pages && loadedCount < pages.length

    let activePage = -1
    $: out = $outData?.slide
    $: if (out?.type === "pdf" && out?.id === path) activePage = out?.page || 0
    else activePage = -1

    function outputPdf(page: number) {
        send("API:play_media", { path, index: page, data: { pageCount: pages?.length } })
    }

    function loadMore() {
        if (!pages) return
        loadedCount = Math.min(loadedCount + batchSize, pages.length)
    }

    $: {
        if (!visiblePages?.length) return
        visiblePages.forEach((pagePath) => {
            if (pagePath && !$mediaCache[pagePath]) send("API:get_thumbnail", { path: pagePath })
        })
    }

    onMount(() => {
        send("API:get_pdf_disk_pages", { path })
    })
</script>

<div class="grid">
    {#if loading}
        <div class="load">
            <Loader />
        </div>
    {:else if pages}
        {#each visiblePages as page, i}
            <div class="main" class:active={activePage === i} style="width: {100 / (pages.length > 1 && tablet ? 3 : pages.length > 1 ? 2 : 1)}%;">
                <div class="slide" tabindex={0} on:click={() => outputPdf(i)}>
                    {#if $mediaCache[page]}
                        <img src={$mediaCache[page]} alt="" />
                    {:else}
                        <span class="page-number">{i + 1}</span>
                    {/if}
                </div>
            </div>
        {/each}

        {#if canLoadMore}
            <div class="load-more">
                <Button on:click={loadMore} center dark>
                    Load more pages
                </Button>
            </div>
        {/if}
    {/if}
</div>

<style>
    img {
        width: 100%;
        height: 100%;
        object-fit: contain;
        pointer-events: none;

        border: none;
    }

    .load {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;

        display: flex;
        justify-content: center;
        align-items: center;

        background-color: var(--primary-darker);
    }

    .grid {
        position: relative;

        display: flex;
        flex-wrap: wrap;
        align-content: flex-start;
        padding: 5px;
        width: 100%;
        height: 100%;

        flex: 1;
        overflow: auto;
        /* FreeShow UI scrollbar */
        scrollbar-width: thin; /* Firefox */
        scrollbar-color: rgb(255 255 255 / 0.3) rgb(255 255 255 / 0.05);
    }
    .grid::-webkit-scrollbar {
        width: 8px;
        height: 8px;
    }
    .grid::-webkit-scrollbar-track,
    .grid::-webkit-scrollbar-corner {
        background: rgb(255 255 255 / 0.05);
    }
    .grid::-webkit-scrollbar-thumb {
        background: rgb(255 255 255 / 0.3);
        border-radius: 8px;
    }
    .grid::-webkit-scrollbar-thumb:hover {
        background: rgb(255 255 255 / 0.5);
    }

    /* one page */
    .grid :global(.overlay) {
        width: 100px;
        height: 100px;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
    }

    .main {
        display: flex;
        position: relative;
        /* height: fit-content; */
        padding: 2px;
    }

    .slide {
        background-color: var(--primary-darkest);
        z-index: 0;
        outline-offset: 0;
        width: 100%;

        position: relative;

        overflow: hidden;

        aspect-ratio: 16 / 9;
        display: flex;
        justify-content: center;
        align-items: center;
    }

    .main.active {
        outline: 2px solid var(--secondary);
        outline-offset: -1px;
    }

    .page-number {
        opacity: 0.7;
        font-size: 1.5em;
        font-weight: 700;
    }

    .load-more {
        width: 100%;
        display: flex;
        justify-content: center;
        padding: 10px 0 14px;
    }
</style>
