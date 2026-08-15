import { randomUUID } from "node:crypto";
import type {
  AnalysisRecord,
  AnalysisSummary,
  AnalyzeResult,
  InputType,
} from "@workspace/api-zod";
import type { VerifiedUser } from "../lib/firebase";
import { firebaseCredentialsPresent, firestore } from "../lib/firebase";
import { logger } from "../lib/logger";

export interface HistoryStore {
  readonly kind: string;
  save(record: AnalysisRecord): Promise<void>;
  listForUser(userId: string): Promise<AnalysisSummary[]>;
  /** Must return null when the record exists but belongs to someone else. */
  getOwned(userId: string, id: string): Promise<AnalysisRecord | null>;
  /** Returns false when the record is absent or not owned by this user. */
  deleteOwned(userId: string, id: string): Promise<boolean>;
}

function toSummary(record: AnalysisRecord): AnalysisSummary {
  return {
    id: record.id,
    inputType: record.inputType,
    extractedClaim: record.result.extracted_claim,
    traceStatus: record.result.trace_status,
    confidence: record.result.confidence,
    matchedLineageId: record.result.lineage?.id ?? null,
    createdAt: record.createdAt,
  };
}

/**
 * Default store. History survives for the life of the process only, which is
 * honest for a prototype without provisioned storage - and means nothing
 * personal is persisted anywhere by default.
 */
class InMemoryHistoryStore implements HistoryStore {
  readonly kind = "memory";
  private readonly records = new Map<string, AnalysisRecord>();

  async save(record: AnalysisRecord): Promise<void> {
    this.records.set(record.id, record);
  }

  async listForUser(userId: string): Promise<AnalysisSummary[]> {
    return [...this.records.values()]
      .filter((r) => r.userId === userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map(toSummary);
  }

  async getOwned(userId: string, id: string): Promise<AnalysisRecord | null> {
    const record = this.records.get(id);
    // Ownership is checked here, not by the caller, so no route can forget to.
    return record && record.userId === userId ? record : null;
  }

  async deleteOwned(userId: string, id: string): Promise<boolean> {
    const record = this.records.get(id);
    if (!record || record.userId !== userId) return false;
    this.records.delete(id);
    return true;
  }
}

interface FirestoreLike {
  collection: (name: string) => {
    doc: (id: string) => {
      set: (data: unknown) => Promise<unknown>;
      get: () => Promise<{ exists: boolean; data: () => AnalysisRecord | undefined }>;
      delete: () => Promise<unknown>;
    };
    where: (
      field: string,
      op: string,
      value: unknown,
    ) => {
      get: () => Promise<{ docs: { data: () => AnalysisRecord }[] }>;
    };
  };
}

/** Used when Firebase is configured, so history survives restarts. */
class FirestoreHistoryStore implements HistoryStore {
  readonly kind = "firestore";
  private readonly collectionName = "analyses";

  private async db(): Promise<FirestoreLike | null> {
    return (await firestore()) as FirestoreLike | null;
  }

  async save(record: AnalysisRecord): Promise<void> {
    const db = await this.db();
    if (!db) return;
    await db.collection(this.collectionName).doc(record.id).set(record);
  }

  async listForUser(userId: string): Promise<AnalysisSummary[]> {
    const db = await this.db();
    if (!db) return [];
    const snapshot = await db
      .collection(this.collectionName)
      .where("userId", "==", userId)
      .get();
    return snapshot.docs
      .map((doc) => doc.data())
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map(toSummary);
  }

  async getOwned(userId: string, id: string): Promise<AnalysisRecord | null> {
    const db = await this.db();
    if (!db) return null;
    const doc = await db.collection(this.collectionName).doc(id).get();
    if (!doc.exists) return null;
    const data = doc.data();
    // Fetching by id then filtering by owner means a guessed id still returns
    // nothing, and returns it as a 404 rather than a 403 so existence is not
    // disclosed.
    return data && data.userId === userId ? data : null;
  }

  async deleteOwned(userId: string, id: string): Promise<boolean> {
    const db = await this.db();
    if (!db) return false;
    const owned = await this.getOwned(userId, id);
    if (!owned) return false;
    await db.collection(this.collectionName).doc(id).delete();
    return true;
  }
}

class HistoryRepository {
  private readonly store: HistoryStore;

  constructor() {
    this.store = firebaseCredentialsPresent()
      ? new FirestoreHistoryStore()
      : new InMemoryHistoryStore();
    logger.info({ store: this.store.kind }, "History store selected");
  }

  get kind(): string {
    return this.store.kind;
  }

  /** True only when the configured Firestore client can actually be created. */
  async isAvailable(): Promise<boolean> {
    return this.store.kind === "firestore" && (await firestore()) !== null;
  }

  /**
   * Saves an analysis only when the caller is authenticated, and returns the
   * result with its `analysis_id` populated. Anonymous analyses are never
   * stored - there is no user to own them.
   *
   * For images the OCR text is stored, never the uploaded bytes, so retention
   * covers only what the analysis actually used.
   */
  async saveIfAuthenticated(
    user: VerifiedUser | null | undefined,
    inputType: InputType,
    originalInput: string,
    result: AnalyzeResult,
  ): Promise<AnalyzeResult> {
    if (!user) return result;

    const record: AnalysisRecord = {
      id: randomUUID(),
      userId: user.userId,
      inputType,
      originalInput,
      result,
      createdAt: new Date().toISOString(),
    };

    try {
      await this.store.save(record);
      return { ...result, analysis_id: record.id };
    } catch (err) {
      // A history write failure must not cost the user their analysis.
      logger.error(
        { err: err instanceof Error ? err.message : "unknown" },
        "Failed to save analysis to history",
      );
      return result;
    }
  }

  listForUser(userId: string): Promise<AnalysisSummary[]> {
    return this.store.listForUser(userId);
  }

  getOwned(userId: string, id: string): Promise<AnalysisRecord | null> {
    return this.store.getOwned(userId, id);
  }

  deleteOwned(userId: string, id: string): Promise<boolean> {
    return this.store.deleteOwned(userId, id);
  }
}

export const historyRepository = new HistoryRepository();
export { InMemoryHistoryStore };
