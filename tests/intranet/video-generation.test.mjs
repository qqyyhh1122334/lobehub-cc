import assert from 'node:assert/strict';
import { createRequire, registerHooks } from 'node:module';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const trpcURL = pathToFileURL(require.resolve('@trpc/server')).href;
// Use real tRPC execution while isolating unrelated authentication middleware.
// The production handlers must reject without touching the supplied DB object.
const trpcFixture = `data:text/javascript,${encodeURIComponent(`
  import { initTRPC } from ${JSON.stringify(trpcURL)};
  export const asyncTrpc = initTRPC.create();
  export const router = asyncTrpc.router;
  export const publicProcedure = asyncTrpc.procedure;
`)}`;
registerHooks({
  resolve(specifier, context, next) {
    if (['@/libs/trpc/lambda', '@/libs/trpc/async/init'].includes(specifier))
      return next(trpcFixture, context);
    if (specifier === '@/server/intranet/services')
      return next(new URL('../../src/server/intranet/services.ts', import.meta.url).href, context);
    return next(specifier, context);
  },
});

const { videoRouter: lambdaVideo } = await import('../../src/server/routers/lambda/video/index.ts');
const { videoRouter: asyncVideo } = await import('../../src/server/routers/async/video.ts');
const { VideoGenerationService } = await import('../../src/server/services/generation/video.ts');
const { processBackgroundVideoPolling } =
  await import('../../src/server/services/generation/videoBackgroundPolling.ts');
const db = new Proxy({}, { get: () => assert.fail('Disabled video code accessed the database') });
const disabled = (error) =>
  error.code === 'INTRANET_FEATURE_DISABLED' || error.cause?.code === 'INTRANET_FEATURE_DISABLED';
const legacyJob = {
  asyncTaskCreatedAt: new Date(),
  asyncTaskId: 'legacy-task',
  generationBatchId: 'legacy-batch',
  generationId: 'legacy-generation',
  generationTopicId: 'legacy-topic',
  inferenceId: 'legacy-inference',
  model: 'legacy-video',
  provider: 'openai',
  userId: 'legacy-user',
};

test('video creation and quotas reject before database writes or provider construction', async () => {
  const caller = lambdaVideo.createCaller({ serverDB: db, userId: 'legacy-user' });
  await assert.rejects(
    caller.createVideo({
      generationTopicId: 'legacy-topic',
      model: 'legacy-video',
      params: { prompt: 'must not submit' },
      provider: 'openai',
    }),
    disabled,
  );
  await assert.rejects(caller.getVideoFreeQuota({ model: 'legacy-video' }), disabled);
});

test('old async callbacks cannot resume video polling', async () => {
  const caller = asyncVideo.createCaller({ serverDB: db, userId: 'legacy-user' });
  await assert.rejects(caller.createVideo(legacyJob), disabled);
  await assert.rejects(processBackgroundVideoPolling(db, legacyJob), disabled);
});

test('direct video processing cannot load or execute a native downloader', async () => {
  assert.throws(() => new VideoGenerationService(db, 'legacy-user'), disabled);
  await assert.rejects(
    VideoGenerationService.prototype.processVideoForGeneration.call(
      {},
      'https://unapproved.invalid/video.mp4',
    ),
    disabled,
  );
});
