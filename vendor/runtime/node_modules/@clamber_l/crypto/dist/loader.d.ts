/* tslint:disable */
/* eslint-disable */
/**
 * QMC1 (qmcflac) decipher, decrypt buffer at given offset.
 */
declare function decryptQMC1(buffer: Uint8Array, offset: number): void;
/**
 * QRC Decrypt ("*.qrc" cache file)
 */
declare function decryptQRCFile(buffer: Uint8Array): Uint8Array;
/**
 * QRC Decrypt (network response)
 */
declare function decryptQRCNetwork(buffer: string): Uint8Array;
/**
 * Create a decipher instance for "BoDian Music".
 */
declare function kuwoBodianCipherFactory(ekey: string): QMC2;
/**
 * Create a decipher instance for "Kuwo KWM v2".
 */
declare function kuwoV2CipherFactory(ekey: string): QMC2;
/**
 * Detect audio type for given file header.
 * Recommended a buffer of 1024 bytes.
 */
declare function detectAudioType(buffer: Uint8Array): AudioTypeResult;
/**
 * Init panic hook
 */
declare function initPanicHook(): void;
/**
 * Decrypt X2M Header
 */
declare function decryptX2MHeader(buffer: Uint8Array): void;
/**
 * Decrypt X3M Header
 */
declare function decryptX3MHeader(buffer: Uint8Array): void;
/**
 * Detected audio result
 */
declare class AudioTypeResult {
  private constructor();
  free(): void;
  /**
   * When this field is not zero, it means we need to feed this amount of bytes to the detector.
   */
  needMore: number;
  /**
   * Audio extension, without "."
   * When is unknown, it will return "bin".
   */
  audioType: string;
}
/**
 * Joox file.
 */
declare class JooxFile {
  private constructor();
  free(): void;
  /**
   * Initialize header. Header should be 0x0c bytes.
   */
  static parse(header: Uint8Array, uuid: string): JooxFile;
  /**
   * Decrypt a given block of buffer (see {@link bufferLength})
   * Return the length of decrypted & unpadded data from the input buffer.
   */
  decrypt(buffer: Uint8Array): number;
  /**
   * Get the buffer size to allocate for decrypt method.
   */
  readonly bufferLength: number;
}
/**
 * Common V1/V2 wrapper interface, derived from `KuwoHeader.makeCipher`
 */
declare class KWMDecipher {
  free(): void;
  /**
   * Create an instance of cipher (decipher) for decryption
   */
  constructor(header: KuwoHeader, ekey?: string);
  /**
   * Decrypt buffer at given offset.
   */
  decrypt(buffer: Uint8Array, offset: number): void;
}
/**
 * Kuwo KWM v1
 */
declare class KWMDecipherV1 {
  private constructor();
  free(): void;
  /**
   * Create a decipher instance for "Kuwo KWM v1".
   */
  decrypt(buffer: Uint8Array, offset: number): void;
}
/**
 * KuGou KGM file decipher.
 */
declare class KuGou {
  private constructor();
  free(): void;
  /**
   * Decrypt Kugou PC client db.
   */
  static decryptDatabase(database: Uint8Array): void;
  /**
   * Parse the KuGou header (0x400 bytes recommended).
   */
  static from_header(header: Uint8Array): KuGou;
  /**
   * Parse the KuGou header (0x400 bytes recommended).
   */
  static fromHeaderV5(header: KuGouHeader, ekey?: string): KuGou;
  /**
   * Decrypt a buffer.
   */
  decrypt(buffer: Uint8Array, offset: number): void;
}
/**
 * KuGou KGM file header.
 */
declare class KuGouHeader {
  free(): void;
  /**
   * Parse the KuGou header (0x400 bytes recommended).
   */
  constructor(header: Uint8Array);
  /**
   * Get the audio hash (kgm v5).
   */
  readonly audioHash: string;
  /**
   * Get version
   */
  readonly version: number;
  /**
   * Get offset to encrypted data
   */
  readonly offsetToData: number;
}
/**
 * Kuwo KWM file header.
 */
declare class KuwoHeader {
  private constructor();
  free(): void;
  /**
   * Parse the KuWo header (0x400 bytes)
   */
  static parse(header: Uint8Array): KuwoHeader;
  /**
   * Get quality id (used for Android Kuwo APP),
   *   that can be then used to extract ekey from mmkv db.
   */
  readonly qualityId: number;
  /**
   * Get resource id
   */
  readonly resourceId: number;
}
/**
 * Migu3D MG3D file decipher.
 */
declare class Migu3D {
  private constructor();
  free(): void;
  /**
   * Create a new decipher and guess its key from first 0x100 bytes.
   */
  static fromHeader(header: Uint8Array): Migu3D;
  /**
   * Create a new decipher from file_key
   */
  static fromFileKey(file_key: string): Migu3D;
  /**
   * Decrypt encrypted buffer part.
   */
  decrypt(buffer: Uint8Array, offset: number): void;
}
/**
 * NCMFile
 */
declare class NCMFile {
  free(): void;
  /**
   * Create a NCMFile instance
   */
  constructor();
  /**
   * Open NCM file.
   * If everything is ok, return `0`.
   * If it needs more header bytes, return positive integer.
   * If it was not a valid NCM file, return -1.
   *
   * # Arguments
   *
   * * `header`: Header bytes of NCM file.
   *
   * returns: Result<i32, JsError>
   *
   * If it needs more bytes, the new header size will be returned.
   * If the header was large enough, it will return 0.
   */
  open(header: Uint8Array): number;
  /**
   * Decrypt buffer.
   *
   * # Arguments
   *
   * * `buffer`: Buffer to decrypt.
   * * `offset`: Offset (start from 0, of encrypted binary data)
   *
   * returns: Result<(), JsError>
   */
  decrypt(buffer: Uint8Array, offset: number): void;
  /**
   * Get audio data offset.
   */
  readonly audioOffset: number;
}
/**
 * QMC2 (mgg/mflac) cipher
 */
declare class QMC2 {
  free(): void;
  /**
   * Create a new QMC2 (mgg/mflac) cipher instance.
   */
  constructor(ekey: string);
  /**
   * Decrypt buffer at given offset.
   */
  decrypt(buffer: Uint8Array, offset: number): void;
}
/**
 * QMC Footer.
 */
declare class QMCFooter {
  private constructor();
  free(): void;
  /**
   * Parse QMC Footer from byte slice.
   *   Recommended to slice the last 1024 bytes of the file.
   */
  static parse(footer: Uint8Array): QMCFooter | undefined;
  /**
   * Get media name (MusicEx)
   */
  readonly mediaName: string | undefined;
  /**
   * Get eKey (if embedded)
   */
  readonly ekey: string | undefined;
  /**
   * Get size of footer
   */
  readonly size: number;
}
/**
 * QingTingFM QTA file decipher.
 */
declare class QingTingFM {
  free(): void;
  static getFileIV(file_name: string): Uint8Array;
  static getDeviceKey(
    product: string,
    device: string,
    manufacturer: string,
    brand: string,
    board: string,
    model: string,
  ): Uint8Array;
  constructor(device_key: Uint8Array, file_iv: Uint8Array);
  /**
   * Decrypt encrypted buffer part.
   */
  decrypt(buffer: Uint8Array, offset: number): void;
}
/**
 * Xiami XM file decipher.
 */
declare class Xiami {
  private constructor();
  free(): void;
  /**
   * Parse the Xiami header (0x400 bytes)
   */
  static from_header(header: Uint8Array): Xiami;
  /**
   * Decrypt encrypted buffer part.
   */
  decrypt(buffer: Uint8Array): void;
  /**
   * After header (0x10 bytes), the number of bytes should be copied without decryption.
   */
  readonly copyPlainLength: number;
}
/**
 * Ximalaya PC Decipher.
 */
declare class XmlyPC {
  free(): void;
  /**
   * Get required bytes for the header, or throw error if not valid XM file.
   */
  static getHeaderSize(buffer: Uint8Array): number;
  /**
   * Create a new XmlyPC decipher
   */
  constructor(header: Uint8Array);
  /**
   * Decrypt encrypted header
   */
  decrypt(buffer: Uint8Array): number;
  /**
   * Get the first few bytes of the header.
   */
  readonly audioHeader: Uint8Array;
  /**
   * Get the size of encrypted header
   */
  readonly encryptedHeaderSize: number;
  /**
   * Get the offset where the encrypted header is
   */
  readonly encryptedHeaderOffset: number;
}

type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

interface InitOutput {
  readonly memory: WebAssembly.Memory;
  readonly __wbg_qmc2_free: (a: number, b: number) => void;
  readonly __wbg_qmcfooter_free: (a: number, b: number) => void;
  readonly decryptQMC1: (a: number, b: number, c: any, d: number) => void;
  readonly qmc2_decrypt: (a: number, b: number, c: number, d: any, e: number) => void;
  readonly qmc2_new: (a: number, b: number) => [number, number, number];
  readonly qmcfooter_ekey: (a: number) => [number, number];
  readonly qmcfooter_mediaName: (a: number) => [number, number];
  readonly qmcfooter_parse: (a: number, b: number) => [number, number, number];
  readonly qmcfooter_size: (a: number) => number;
  readonly __wbg_migu3d_free: (a: number, b: number) => void;
  readonly __wbg_qingtingfm_free: (a: number, b: number) => void;
  readonly decryptQRCFile: (a: number, b: number, c: any) => [number, number, number, number];
  readonly decryptQRCNetwork: (a: number, b: number) => [number, number, number, number];
  readonly migu3d_decrypt: (a: number, b: number, c: number, d: any, e: number) => void;
  readonly migu3d_fromFileKey: (a: number, b: number) => [number, number, number];
  readonly migu3d_fromHeader: (a: number, b: number) => [number, number, number];
  readonly qingtingfm_decrypt: (a: number, b: number, c: number, d: any, e: number) => void;
  readonly qingtingfm_getDeviceKey: (
    a: number,
    b: number,
    c: number,
    d: number,
    e: number,
    f: number,
    g: number,
    h: number,
    i: number,
    j: number,
    k: number,
    l: number,
  ) => [number, number];
  readonly qingtingfm_getFileIV: (a: number, b: number) => [number, number, number, number];
  readonly qingtingfm_new: (a: number, b: number, c: number, d: number) => [number, number, number];
  readonly __wbg_kuwoheader_free: (a: number, b: number) => void;
  readonly __wbg_kwmdecipher_free: (a: number, b: number) => void;
  readonly __wbg_kwmdecipherv1_free: (a: number, b: number) => void;
  readonly kuwoBodianCipherFactory: (a: number, b: number) => [number, number, number];
  readonly kuwoV2CipherFactory: (a: number, b: number) => [number, number, number];
  readonly kuwoheader_parse: (a: number, b: number) => [number, number, number];
  readonly kuwoheader_qualityId: (a: number) => number;
  readonly kuwoheader_resourceId: (a: number) => number;
  readonly kwmdecipher_decrypt: (a: number, b: number, c: number, d: any, e: number) => void;
  readonly kwmdecipher_make_decipher: (a: number, b: number, c: number) => [number, number, number];
  readonly kwmdecipherv1_decrypt: (a: number, b: number, c: number, d: any, e: number) => void;
  readonly __wbg_kugou_free: (a: number, b: number) => void;
  readonly __wbg_kugouheader_free: (a: number, b: number) => void;
  readonly kugou_decrypt: (a: number, b: number, c: number, d: any, e: number) => void;
  readonly kugou_decryptDatabase: (a: number, b: number, c: any) => [number, number];
  readonly kugou_fromHeaderV5: (a: number, b: number, c: number) => [number, number, number];
  readonly kugou_from_header: (a: number, b: number) => [number, number, number];
  readonly kugouheader_audioHash: (a: number) => [number, number];
  readonly kugouheader_new: (a: number, b: number) => [number, number, number];
  readonly kugouheader_offsetToData: (a: number) => number;
  readonly kugouheader_version: (a: number) => number;
  readonly __wbg_audiotyperesult_free: (a: number, b: number) => void;
  readonly __wbg_get_audiotyperesult_audioType: (a: number) => [number, number];
  readonly __wbg_get_audiotyperesult_needMore: (a: number) => number;
  readonly __wbg_set_audiotyperesult_audioType: (a: number, b: number, c: number) => void;
  readonly __wbg_set_audiotyperesult_needMore: (a: number, b: number) => void;
  readonly __wbg_xiami_free: (a: number, b: number) => void;
  readonly detectAudioType: (a: number, b: number) => [number, number, number];
  readonly xiami_copyPlainLength: (a: number) => number;
  readonly xiami_decrypt: (a: number, b: number, c: number, d: any) => void;
  readonly xiami_from_header: (a: number, b: number) => [number, number, number];
  readonly __wbg_ncmfile_free: (a: number, b: number) => void;
  readonly initPanicHook: () => void;
  readonly ncmfile_audioOffset: (a: number) => [number, number, number];
  readonly ncmfile_decrypt: (a: number, b: number, c: number, d: any, e: number) => [number, number];
  readonly ncmfile_new: () => [number, number, number];
  readonly ncmfile_open: (a: number, b: number, c: number) => [number, number, number];
  readonly __wbg_jooxfile_free: (a: number, b: number) => void;
  readonly __wbg_xmlypc_free: (a: number, b: number) => void;
  readonly decryptX2MHeader: (a: number, b: number, c: any) => [number, number];
  readonly decryptX3MHeader: (a: number, b: number, c: any) => [number, number];
  readonly jooxfile_bufferLength: (a: number) => number;
  readonly jooxfile_decrypt: (a: number, b: number, c: number, d: any) => [number, number, number];
  readonly jooxfile_parse: (a: number, b: number, c: number, d: number) => [number, number, number];
  readonly xmlypc_audioHeader: (a: number) => [number, number];
  readonly xmlypc_decrypt: (a: number, b: number, c: number, d: any) => [number, number, number];
  readonly xmlypc_encryptedHeaderOffset: (a: number) => number;
  readonly xmlypc_encryptedHeaderSize: (a: number) => number;
  readonly xmlypc_getHeaderSize: (a: number, b: number) => [number, number, number];
  readonly xmlypc_new: (a: number, b: number) => [number, number, number];
  readonly __wbindgen_free: (a: number, b: number, c: number) => void;
  readonly __wbindgen_malloc: (a: number, b: number) => number;
  readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
  readonly __wbindgen_export_3: WebAssembly.Table;
  readonly __externref_table_dealloc: (a: number) => void;
  readonly __wbindgen_start: () => void;
}

type SyncInitInput = BufferSource | WebAssembly.Module;
/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
declare function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
declare function __wbg_init(
  module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>,
): Promise<InitOutput>;

/**
 * Get package version.
 * @returns {string}
 */
declare function getUmcVersion(): string;

declare const ready: Promise<void>;

export {
  AudioTypeResult,
  type InitInput,
  type InitOutput,
  JooxFile,
  KWMDecipher,
  KWMDecipherV1,
  KuGou,
  KuGouHeader,
  KuwoHeader,
  Migu3D,
  NCMFile,
  QMC2,
  QMCFooter,
  QingTingFM,
  type SyncInitInput,
  Xiami,
  XmlyPC,
  __wbg_init,
  decryptQMC1,
  decryptQRCFile,
  decryptQRCNetwork,
  decryptX2MHeader,
  decryptX3MHeader,
  detectAudioType,
  getUmcVersion,
  initPanicHook,
  initSync,
  kuwoBodianCipherFactory,
  kuwoV2CipherFactory,
  ready,
};
