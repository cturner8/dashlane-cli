import { decryptTransactions } from '../modules/crypto';
import { connectAndPrepare, findVaultSecret } from '../modules/database';
import {
    AuthentifiantTransactionContent,
    BackupEditTransaction,
    ParsedPath,
    SecureNoteTransactionContent,
    VaultCredential,
    VaultNote,
} from '../types';
import { beautifySecrets, filterMatches, parsePath } from '../utils';

const read = async (path?: string) => {
    const { db, secrets } = await connectAndPrepare({});

    let parsedPath: ParsedPath = {};
    if (path) {
        parsedPath = parsePath(path);
    }

    let transactions: BackupEditTransaction[] = [];

    if (parsedPath.secretId) {
        transactions = db
            .prepare(
                `SELECT * 
                FROM transactions
                WHERE login = ?
                    AND identifier = ?
                    AND action = 'BACKUP_EDIT'
                `
            )
            .bind(secrets.login, parsedPath.secretId)
            .all() as BackupEditTransaction[];
    }

    if (parsedPath.title) {
        transactions = db
            .prepare(
                `SELECT *
                FROM transactions
                WHERE login = ?
                    AND action = 'BACKUP_EDIT'
                    AND (type = 'AUTHENTIFIANT' OR type = 'SECURENOTE')
                `
            )
            .bind(secrets.login)
            .all() as BackupEditTransaction[];
    }

    if (!transactions.length) {
        transactions = db
            .prepare(
                `SELECT *
                FROM transactions
                WHERE action = 'BACKUP_EDIT'
                    AND (type = 'AUTHENTIFIANT' OR type = 'SECURENOTE')`
            )
            .all() as BackupEditTransaction[];
    }

    db.close();

    const credentials = transactions.filter((transaction) => transaction.type === 'AUTHENTIFIANT');
    const notes = transactions.filter((transaction) => transaction.type === 'SECURENOTE');

    const decryptedCredentials = await decryptTransactions<AuthentifiantTransactionContent>(credentials, secrets);
    const decryptedNotes = await decryptTransactions<SecureNoteTransactionContent>(notes, secrets);

    const secretsDecrypted = beautifySecrets({ credentials: decryptedCredentials, notes: decryptedNotes });

    return { secretsDecrypted, parsedPath };
};

export const runRead = async (path: string) => {
    const { secretsDecrypted, parsedPath } = await read(path);

    console.log(findVaultSecret(secretsDecrypted, parsedPath));
};

export const runList = async (filters: string[] | null, options: { verbose: boolean }) => {
    const { verbose = false } = options;
    const { secretsDecrypted } = await read();

    let filteredCredentials: Partial<VaultCredential>[] = filterMatches(secretsDecrypted.credentials, filters);
    let filteredNotes: Partial<VaultNote>[] = filterMatches(secretsDecrypted.notes, filters);

    if (verbose) {
        filteredCredentials = filteredCredentials.map(
            ({
                id,
                title,
                url,
                email,
                lastUse,
                category,
                modificationDatetime,
                lastBackupTime,
            }): Partial<VaultCredential> => ({
                id,
                title,
                url,
                email,
                lastUse,
                category,
                modificationDatetime,
                lastBackupTime,
            })
        );
        filteredNotes = filteredNotes.map(
            ({
                id,
                title,
                category,
                creationDate,
                creationDateTime,
                updateDate,
                type,
                lastBackupTime,
            }): Partial<VaultNote> => ({
                id,
                title,
                category,
                creationDate,
                creationDateTime,
                updateDate,
                type,
                lastBackupTime,
            })
        );
    } else {
        filteredCredentials = filteredCredentials.map(
            ({ id, title, url, email }): Partial<VaultCredential> => ({
                id,
                title,
                url,
                email,
            })
        );
        filteredNotes = filteredNotes.map(({ id, title }): Partial<VaultNote> => ({ id, title }));
    }

    const output = {
        credentials: filteredCredentials,
        notes: filteredNotes,
    };

    console.log(JSON.stringify(output, null, 2));
};
